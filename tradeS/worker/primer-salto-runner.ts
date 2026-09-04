/**
 * The Primer Salto strategy, run once a day just before the close.
 *
 * Deliberately NOT part of the AI rule engine. That engine gates every order
 * on a fresh prediction (`rules.ts`: "no OK prediction available"), which is
 * right for rules that trade the model's opinion — and wrong here: this
 * checklist is purely technical and was measured without any model in the
 * loop. Bending the rule engine to allow prediction-free rules would blur
 * two systems whose whole point is to be compared against each other. So
 * they run side by side, share the same safeguards, and keep separate books.
 *
 * Fidelity notes, because they matter for reading the results later:
 *
 *  • The backtest entered at the DAILY CLOSE. This runs at 15:50 ET, so the
 *    last bar is nearly-but-not-quite final. That is the strategy's own
 *    "buy 5 minutes before the close" rule, and it is what a person doing
 *    the 15:45–15:55 review would see — but a late move can still flip a
 *    marginal signal. Live and backtest results will not match trade for
 *    trade.
 *  • Rule 5 (macro calendar: FOMC, CPI, NFP) is a MANUAL check in the
 *    original method. A scheduled runner cannot make it. The backtest did
 *    not include it either, so the measured edge does not depend on it —
 *    but the human version of this strategy has a filter this one lacks.
 */
import cron from "node-cron";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { env } from "@/lib/env";
import { alpaca } from "@/lib/alpaca/client";
import { toAlpacaSymbol } from "@/lib/alpaca/symbols";
import { insertOrderWithLegs } from "@/lib/alpaca/orders-log";
import { getDailyBars } from "@/lib/yahoo/quotes";
import { getBotConfig, isLiveAckValid, disableBot } from "@/lib/bot/config";
import { checkSafeguards } from "@/lib/bot/safeguards";
import { notify } from "@/lib/bot/notify";
import { PRIMER_SALTO_UNIVERSE } from "@/lib/study/universe";
import { getCurrentRegime } from "@/lib/research/regime";
import {
  PRIMER_SALTO_STRATEGY,
  decideForSymbol,
  decideTimeExit,
  maxConcurrentPositions,
  marketContext,
  scanOrder,
  scanSummary,
  tradingDate,
  toCents,
} from "@/lib/bot/primer-salto";
import { DEFAULT_PARAMS } from "@/lib/study/primer-salto";

/** Enough for the 40-period mean, the trend window, AND the 52-week high
 * recorded as context on every entry. */
const BARS_NEEDED = 280;
/** Yahoo is polite but 69 symbols back to back is not. */
const FETCH_GAP_MS = 150;

interface OpenRow {
  id: number;
  symbol: string;
  entryDate: string;
  maxBars: number;
}

function openPositions(): OpenRow[] {
  return db
    .select({
      id: tables.strategyPositions.id,
      symbol: tables.strategyPositions.symbol,
      entryDate: tables.strategyPositions.entryDate,
      maxBars: tables.strategyPositions.maxBars,
    })
    .from(tables.strategyPositions)
    .where(
      and(
        eq(tables.strategyPositions.strategy, PRIMER_SALTO_STRATEGY),
        eq(tables.strategyPositions.status, "open"),
      ),
    )
    .all();
}

function closeRow(id: number, reason: string): void {
  db.update(tables.strategyPositions)
    .set({ status: "closed", closedTs: Date.now(), closeReason: reason })
    .where(eq(tables.strategyPositions.id, id))
    .run();
}

function logActivity(entry: {
  symbol?: string | null;
  decision: "buy" | "sell" | "skip" | "blocked" | "halt";
  reason: string;
  orderId?: string | null;
  snapshot?: unknown;
}): void {
  db.insert(tables.botActivity)
    .values({
      ts: Date.now(),
      ruleId: null,
      ruleVersion: null,
      symbol: entry.symbol ?? null,
      decision: entry.decision,
      reason: `[primer-salto] ${entry.reason}`,
      orderId: entry.orderId ?? null,
      snapshot: entry.snapshot ?? null,
    })
    .run();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runPrimerSaltoTick(): Promise<void> {
  const config = getBotConfig();
  if (!config.primerSaltoEnabled || !env.hasAlpacaKeys) return;

  const [clock, account, rawPositions] = await Promise.all([
    alpaca.getClock(),
    alpaca.getAccount(),
    alpaca.getPositions(),
  ]);
  if (!clock.is_open) {
    console.log("[primer-salto] market closed — nothing to do");
    logActivity({ decision: "skip", reason: "market closed — no scan" });
    return;
  }

  const held = new Map<string, number>();
  for (const p of rawPositions as Array<{ symbol: string; market_value: string }>) {
    held.set(p.symbol.replace(/\./g, "-"), Math.abs(Number(p.market_value)));
  }
  const equity = Number(account.equity);
  const totalExposureUsd = [...held.values()].reduce((a, v) => a + v, 0);

  // ── 1. Positions the broker already closed (stop or target filled) ──────
  let rows = openPositions();
  for (const row of rows) {
    if (!held.has(row.symbol)) {
      closeRow(row.id, "closed at the broker (stop or target)");
      logActivity({ symbol: row.symbol, decision: "sell", reason: "bracket leg filled — book closed" });
    }
  }

  // ── 2. The time exit the broker cannot express ──────────────────────────
  rows = openPositions();
  for (const row of rows) {
    try {
      const bars = await getDailyBars(row.symbol, BARS_NEEDED);
      const decision = decideTimeExit(row, bars.map((b) => tradingDate(b.ts)));
      if (!decision.close) continue;

      const order = await alpaca.closePosition(row.symbol, true);
      insertOrderWithLegs(order, "bot");
      closeRow(row.id, decision.reason);
      notify({ kind: "sell", symbol: row.symbol, reason: `Primer Salto — ${decision.reason}` });
      logActivity({ symbol: row.symbol, decision: "sell", reason: decision.reason, orderId: order.id });
    } catch (err) {
      console.error(`[primer-salto] time exit failed for ${row.symbol}:`, err);
    }
    await sleep(FETCH_GAP_MS);
  }

  // ── 3. New signals ──────────────────────────────────────────────────────
  // Recorded on every entry from day one. Nothing filters on regime yet, and
  // that is deliberate: filtering on an untested hunch is how you fit noise.
  // But a year from now the only way to ask "did this work better in a bull
  // market?" is to have written it down at the time.
  const regime = await getCurrentRegime().catch(() => null);
  const market = await getDailyBars("SPY", 260)
    .then((bars) => marketContext(bars.map((b) => b.close)))
    .catch(() => ({ spyAboveMa200: null, spyAboveMa20: null }));

  const notionalUsd = config.primerSaltoNotionalUsd;
  const maxConcurrent = maxConcurrentPositions(config.maxTotalExposureUsd, notionalUsd);
  let openCount = openPositions().length;
  let bought = 0;
  let scanned = 0;
  let fetchFailures = 0;

  // Shuffled per day, not walked in list order: see scanOrder(). On a
  // cluster day the slots would otherwise always go to the front of the
  // array.
  for (const symbol of scanOrder(PRIMER_SALTO_UNIVERSE, tradingDate(Date.now()))) {
    if (openCount >= maxConcurrent) break;
    let read = false;
    try {
      const bars = await getDailyBars(symbol, BARS_NEEDED);
      read = true;
      scanned += 1;
      const decision = decideForSymbol({
        bars,
        hasPosition: held.has(symbol),
        openStrategyPositions: openCount,
        maxConcurrent,
        notionalUsd,
        equity,
        riskPct: config.primerSaltoRiskPct,
        maxPositionUsd: Math.min(config.maxPositionUsd, notionalUsd),
        params: DEFAULT_PARAMS,
      });
      if (decision.act === "skip") continue;

      const { plan, shares, sizing } = decision;
      const orderNotionalUsd = sizing.notionalUsd;

      // The same gate the AI bot passes through. predictionAgeMs is 0: this
      // order is driven by a bar from minutes ago, not by a stored forecast,
      // so the staleness guard has nothing to measure and must not block it.
      const guard = checkSafeguards({
        tradingBaseUrl: env.tradingBaseUrl,
        allowLiveEnv: env.allowLive,
        liveKeysInUse: !env.paper && Boolean(env.alpacaLiveKeyId && env.alpacaLiveSecretKey),
        liveAckOk: isLiveAckValid(config),
        marketOpen: clock.is_open,
        predictionAgeMs: 0,
        dayStartEquity: null,
        currentEquity: equity,
        maxDailyLossUsd: config.maxDailyLossUsd,
        orderNotionalUsd,
        symbolExposureUsd: held.get(symbol) ?? 0,
        totalExposureUsd,
        maxPositionUsd: config.maxPositionUsd,
        maxTotalExposureUsd: config.maxTotalExposureUsd,
        ordersToday: bought,
        maxOrdersPerDay: config.maxOrdersPerDay,
        lastOrderForSymbolAt: null,
        cooldownMinutes: config.cooldownMinutes,
        now: Date.now(),
      });
      if (!guard.ok) {
        logActivity({ symbol, decision: "blocked", reason: guard.reason });
        if (guard.halt) {
          disableBot(`[primer-salto] ${guard.reason}`);
          notify({ kind: "halt", symbol, reason: guard.reason });
          return;
        }
        continue;
      }

      const order = await alpaca.submitOrder({
        symbol: toAlpacaSymbol(symbol),
        side: "buy",
        type: "market",
        time_in_force: "day",
        qty: String(shares),
        order_class: "bracket",
        stop_loss: { stop_price: String(toCents(plan.stopPrice)) },
        take_profit: { limit_price: String(toCents(plan.targetPrice)) },
      });
      insertOrderWithLegs(order, "bot");

      db.insert(tables.strategyPositions)
        .values({
          strategy: PRIMER_SALTO_STRATEGY,
          symbol,
          entryTs: Date.now(),
          entryDate: plan.entryDate,
          entryOrderId: order.id,
          entryPrice: plan.price,
          stopPrice: toCents(plan.stopPrice),
          targetPrice: toCents(plan.targetPrice),
          maxBars: DEFAULT_PARAMS.maxBars,
          status: "open",
        })
        .run();

      const reason =
        `checklist met — ${shares} shares (~$${orderNotionalUsd.toFixed(0)}, ` +
        `risking $${sizing.riskUsd.toFixed(0)}, bound by ${sizing.boundBy}), ` +
        `stop $${toCents(plan.stopPrice)}, target $${toCents(plan.targetPrice)}`;
      notify({ kind: "buy", symbol, reason: `Primer Salto — ${reason}` });
      logActivity({
        symbol,
        decision: "buy",
        reason,
        orderId: order.id,
        snapshot: { ...plan, regime, ...market, sizing, shares, orderNotionalUsd },
      });
      openCount += 1;
      bought += 1;
    } catch (err) {
      // Only a throw BEFORE the bars came back means the symbol went unread.
      // A throw after that is an order that did not go through — a different
      // problem, and one that must not be reported as a data outage.
      if (!read) fetchFailures += 1;
      console.error(`[primer-salto] ${symbol} failed:`, err);
    }
    await sleep(FETCH_GAP_MS);
  }

  const summary = scanSummary({
    universe: PRIMER_SALTO_UNIVERSE.length,
    scanned,
    fetchFailures,
    bought,
    openCount,
    maxConcurrent,
  });
  console.log(`[primer-salto] ${summary}`);
  logActivity({ decision: "skip", reason: summary });
}

export function startPrimerSaltoRunner(): void {
  // 15:50 New York: the strategy's "5 minutes before the close" rule, with a
  // few minutes' margin for 69 symbols' worth of fetching.
  cron.schedule(
    "50 15 * * 1-5",
    () => {
      runPrimerSaltoTick().catch((err) => console.error("[primer-salto] tick failed:", err));
    },
    { timezone: "America/New_York" },
  );
}
