import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { env } from "@/lib/env";
import { alpaca, type AlpacaOrder } from "@/lib/alpaca/client";
import { toAlpacaSymbol, isUsTicker } from "@/lib/alpaca/symbols";
import { insertOrderWithLegs, isTerminalStatus, markOrdersCanceled } from "@/lib/alpaca/orders-log";
import { getTrackedSymbols } from "@/lib/tracked";
import { effectiveConfidence } from "@/lib/research/calibration";
import { evaluateRule, RuleActionSchema, RuleConditionSchema, type RuleAction, type RuleCondition } from "./rules";
import { checkSafeguards } from "./safeguards";
import { computeBudgetNotional } from "./sizing";
import { getBotConfig, isLiveAckValid, disableBot, type BotConfigValues } from "./config";

interface PositionInfo {
  symbol: string;
  qty: number;
  marketValue: number;
}

interface TickDeps {
  config: BotConfigValues;
  positions: PositionInfo[];
  equity: number;
  cash: number;
  marketOpen: boolean;
}

function logActivity(entry: {
  ruleId?: number | null;
  ruleVersion?: number | null;
  symbol?: string | null;
  decision: "buy" | "sell" | "skip" | "blocked" | "halt";
  reason: string;
  orderId?: string | null;
  snapshot?: unknown;
}): void {
  db.insert(tables.botActivity)
    .values({
      ts: Date.now(),
      ruleId: entry.ruleId ?? null,
      ruleVersion: entry.ruleVersion ?? null,
      symbol: entry.symbol ?? null,
      decision: entry.decision,
      reason: entry.reason,
      orderId: entry.orderId ?? null,
      snapshot: entry.snapshot ?? null,
    })
    .run();
}

/** Start of the current day in America/New_York, as epoch ms. */
export function startOfTodayEt(now = new Date()): number {
  const etParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // YYYY-MM-DD
  // Interpret that date's midnight in ET by asking what UTC time midnight ET is.
  const probe = new Date(`${etParts}T00:00:00-05:00`).getTime();
  const probeDst = new Date(`${etParts}T00:00:00-04:00`).getTime();
  // Pick whichever candidate formats back to 00:xx in ET.
  const hourAt = (ts: number) =>
    Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date(ts)));
  return hourAt(probe) === 0 ? probe : probeDst;
}

function equityAtDayStart(): number | null {
  const dayStart = startOfTodayEt();
  const [row] = db
    .select()
    .from(tables.accountSnapshots)
    .where(gte(tables.accountSnapshots.ts, dayStart))
    .orderBy(tables.accountSnapshots.ts)
    .limit(1)
    .all();
  return row?.equity ?? null;
}

function botOrdersToday(): number {
  const dayStart = startOfTodayEt();
  return db
    .select({ id: tables.ordersLog.id })
    .from(tables.ordersLog)
    .where(
      and(
        eq(tables.ordersLog.source, "bot"),
        isNull(tables.ordersLog.parentOrderId),
        gte(tables.ordersLog.submittedAt, dayStart),
      ),
    )
    .all().length;
}

function lastBotOrderForSymbol(symbol: string): number | null {
  const [row] = db
    .select({ submittedAt: tables.ordersLog.submittedAt })
    .from(tables.ordersLog)
    .where(
      and(
        eq(tables.ordersLog.source, "bot"),
        eq(tables.ordersLog.symbol, symbol),
        isNull(tables.ordersLog.parentOrderId),
      ),
    )
    .orderBy(desc(tables.ordersLog.submittedAt))
    .limit(1)
    .all();
  return row?.submittedAt ?? null;
}

interface LatestPredictionInfo {
  id: number;
  outlook: "bullish" | "neutral" | "bearish";
  rawConfidence: number;
  effective: number;
  capped: boolean;
  createdAt: number;
  patterns: string[];
  rsi14: number | null;
}

function latestOkPrediction(symbol: string): LatestPredictionInfo | null {
  const [row] = db
    .select()
    .from(tables.predictions)
    .where(and(eq(tables.predictions.symbol, symbol), eq(tables.predictions.status, "ok")))
    .orderBy(desc(tables.predictions.createdAt))
    .limit(1)
    .all();
  if (!row) return null;
  const cal = effectiveConfidence(row.outlook, row.confidence);
  return {
    id: row.id,
    outlook: row.outlook,
    rawConfidence: row.confidence,
    effective: cal.effective,
    capped: cal.capped,
    createdAt: row.createdAt,
    patterns: row.quantSnapshot?.patterns.map((p) => p.type) ?? [],
    rsi14: row.quantSnapshot?.indicators.rsi14 ?? null,
  };
}

function currentPrice(symbol: string): number | null {
  const [row] = db
    .select({ price: tables.latestPrices.price })
    .from(tables.latestPrices)
    .where(eq(tables.latestPrices.symbol, symbol))
    .limit(1)
    .all();
  return row?.price ?? null;
}

function safeguardBaseInput(deps: TickDeps, prediction: LatestPredictionInfo, symbol: string) {
  const config = deps.config;
  const symbolPos = deps.positions.find((p) => p.symbol === symbol);
  return {
    tradingBaseUrl: env.tradingBaseUrl,
    allowLiveEnv: env.allowLive,
    liveKeysInUse: !env.paper && Boolean(env.alpacaLiveKeyId && env.alpacaLiveSecretKey),
    liveAckOk: isLiveAckValid(config),
    marketOpen: deps.marketOpen,
    predictionAgeMs: Date.now() - prediction.createdAt,
    dayStartEquity: equityAtDayStart(),
    currentEquity: deps.equity,
    maxDailyLossUsd: config.maxDailyLossUsd,
    symbolExposureUsd: Math.abs(symbolPos?.marketValue ?? 0),
    totalExposureUsd: deps.positions.reduce((a, p) => a + Math.abs(p.marketValue), 0),
    maxPositionUsd: config.maxPositionUsd,
    maxTotalExposureUsd: config.maxTotalExposureUsd,
    ordersToday: botOrdersToday(),
    maxOrdersPerDay: config.maxOrdersPerDay,
    lastOrderForSymbolAt: lastBotOrderForSymbol(symbol),
    cooldownMinutes: config.cooldownMinutes,
    now: Date.now(),
  };
}

async function tryBuy(
  deps: TickDeps,
  rule: { id: number; version: number },
  condition: RuleCondition,
  action: RuleAction,
  symbol: string,
  prediction: LatestPredictionInfo,
): Promise<void> {
  const price = currentPrice(symbol);
  if (price === null) {
    logActivity({ ruleId: rule.id, ruleVersion: rule.version, symbol, decision: "skip", reason: "no live price" });
    return;
  }

  const config = deps.config;
  const symbolPos = deps.positions.find((p) => p.symbol === symbol);
  const sizing = computeBudgetNotional({
    budgetUsd: config.budgetUsd,
    effectiveConfidence: prediction.effective,
    maxPositionUsd: config.maxPositionUsd,
    symbolExposureUsd: Math.abs(symbolPos?.marketValue ?? 0),
    totalExposureUsd: deps.positions.reduce((a, p) => a + Math.abs(p.marketValue), 0),
    cashUsd: deps.cash,
    cashReservePct: config.cashReservePct,
    price,
    maxSlicePct: config.maxSlicePct,
  });
  if (!sizing.ok) {
    logActivity({ ruleId: rule.id, ruleVersion: rule.version, symbol, decision: "skip", reason: sizing.reason });
    return;
  }

  const guard = checkSafeguards({
    ...safeguardBaseInput(deps, prediction, symbol),
    orderNotionalUsd: sizing.notionalUsd,
  });
  if (!guard.ok) {
    logActivity({ ruleId: rule.id, ruleVersion: rule.version, symbol, decision: guard.halt ? "halt" : "blocked", reason: guard.reason });
    if (guard.halt) disableBot(`circuit breaker: ${guard.reason}`);
    return;
  }

  // Bracket order: market entry + server-side stop (and TP; Alpaca brackets
  // require both legs, so an unset TP is parked far away). Whole shares only.
  const stopPrice = Number((price * (1 - action.stopLossPct / 100)).toFixed(2));
  const tpPct = action.takeProfitPct ?? 1000;
  const takeProfitPrice = Number((price * (1 + tpPct / 100)).toFixed(2));

  const order = await alpaca.submitOrder({
    symbol: toAlpacaSymbol(symbol),
    side: "buy",
    type: "market",
    time_in_force: "day",
    qty: String(sizing.shares),
    order_class: "bracket",
    stop_loss: { stop_price: String(stopPrice) },
    take_profit: { limit_price: String(takeProfitPrice) },
  });
  insertOrderWithLegs(order, "bot");
  logActivity({
    ruleId: rule.id,
    ruleVersion: rule.version,
    symbol,
    decision: "buy",
    reason: `rule matched; bought ${sizing.shares} shares (~$${sizing.notionalUsd.toFixed(0)}) with ${action.stopLossPct}% stop`,
    orderId: order.id,
    snapshot: {
      rule: { condition, action },
      price,
      rawConfidence: prediction.rawConfidence,
      effectiveConfidence: prediction.effective,
      capped: prediction.capped,
      outlook: prediction.outlook,
      predictionId: prediction.id,
      stopPrice,
      takeProfitPrice,
    },
  });
}

async function trySell(
  deps: TickDeps,
  rule: { id: number; version: number },
  condition: RuleCondition,
  action: RuleAction,
  symbol: string,
  prediction: LatestPredictionInfo,
): Promise<void> {
  const guard = checkSafeguards({
    ...safeguardBaseInput(deps, prediction, symbol),
    orderNotionalUsd: 0, // a sell reduces exposure; caps must not block it
  });
  if (!guard.ok) {
    logActivity({ ruleId: rule.id, ruleVersion: rule.version, symbol, decision: guard.halt ? "halt" : "blocked", reason: guard.reason });
    if (guard.halt) disableBot(`circuit breaker: ${guard.reason}`);
    return;
  }

  // Close the whole position; cancel_orders drops the bracket legs first.
  const order = await alpaca.closePosition(symbol, true);
  insertOrderWithLegs(order, "bot");
  logActivity({
    ruleId: rule.id,
    ruleVersion: rule.version,
    symbol,
    decision: "sell",
    reason: "sell rule matched; closing the whole position",
    orderId: order.id,
    snapshot: {
      rule: { condition, action },
      rawConfidence: prediction.rawConfidence,
      effectiveConfidence: prediction.effective,
      capped: prediction.capped,
      outlook: prediction.outlook,
      predictionId: prediction.id,
    },
  });
}

/** One bot tick (cron: every 5 min in market hours). */
export async function runBotTick(): Promise<void> {
  const config = getBotConfig();
  if (!config.enabled || !env.hasAlpacaKeys) return;

  const [clock, account, rawPositions] = await Promise.all([
    alpaca.getClock(),
    alpaca.getAccount(),
    alpaca.getPositions(),
  ]);

  const positions: PositionInfo[] = (rawPositions as Array<{ symbol: string; qty: string; market_value: string }>).map(
    (p) => ({
      symbol: p.symbol.replace(/\./g, "-"),
      qty: Number(p.qty),
      marketValue: Number(p.market_value),
    }),
  );

  const deps: TickDeps = {
    config,
    positions,
    equity: Number(account.equity),
    cash: Number(account.cash),
    marketOpen: clock.is_open,
  };

  const rules = db.select().from(tables.botRules).where(eq(tables.botRules.enabled, true)).all();

  for (const rule of rules) {
    const condParse = RuleConditionSchema.safeParse(rule.condition);
    const actionParse = RuleActionSchema.safeParse(rule.action);
    if (!condParse.success || !actionParse.success) {
      logActivity({ ruleId: rule.id, ruleVersion: rule.version, decision: "skip", reason: "rule failed validation — fix it on the Bot page" });
      continue;
    }
    const condition = condParse.data;
    const action = actionParse.data;

    // Sell rules scan held positions; buy rules scan tracked US symbols.
    const universe =
      action.side === "sell"
        ? positions.map((p) => p.symbol)
        : getTrackedSymbols().filter(isUsTicker);

    for (const symbol of universe) {
      const prediction = latestOkPrediction(symbol);
      const evalResult = evaluateRule(condition, action, {
        symbol,
        prediction: prediction
          ? { outlook: prediction.outlook, effectiveConfidence: prediction.effective, createdAt: prediction.createdAt }
          : null,
        detectedPatterns: prediction?.patterns ?? [],
        rsi14: prediction?.rsi14 ?? null,
        hasPosition: positions.some((p) => p.symbol === symbol && p.qty > 0),
      });
      if (!evalResult.match) continue; // non-matches are not logged (too noisy)
      if (!prediction) continue;

      try {
        if (action.side === "buy") {
          await tryBuy(deps, rule, condition, action, symbol, prediction);
        } else {
          await trySell(deps, rule, condition, action, symbol, prediction);
        }
      } catch (err) {
        logActivity({
          ruleId: rule.id,
          ruleVersion: rule.version,
          symbol,
          decision: "blocked",
          reason: `order failed: ${String(err).slice(0, 300)}`,
        });
      }

      // Stop scanning if the halt tripped mid-tick.
      if (!getBotConfig().enabled) return;
    }
  }
}

/** The KILL SWITCH: disable the bot and cancel open PARENT orders only.
 * Never cancel a lone leg — that would strip stop protection from an open
 * position. Returns how many orders were canceled. */
export async function killBot(): Promise<number> {
  disableBot("kill switch pressed");
  if (!env.hasAlpacaKeys) return 0;

  const open = db
    .select()
    .from(tables.ordersLog)
    .where(and(eq(tables.ordersLog.source, "bot"), isNull(tables.ordersLog.parentOrderId)))
    .all()
    .filter((o) => !isTerminalStatus(o.status));

  let canceled = 0;
  for (const order of open) {
    try {
      await alpaca.cancelOrder(order.alpacaOrderId);
      markOrdersCanceled([order.alpacaOrderId]);
      canceled++;
    } catch (err) {
      console.error(`[bot] kill switch failed to cancel ${order.alpacaOrderId}:`, err);
    }
  }
  return canceled;
}
