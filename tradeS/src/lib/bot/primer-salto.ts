/**
 * Decision logic for the Primer Salto runner, as pure functions.
 *
 * The strategy itself lives in `@/lib/study/primer-salto` — the SAME module
 * the backtest used. Nothing here re-implements the checklist; that would
 * invite the live signal and the measured one to drift apart. This file only
 * answers the questions the backtest never had to: is today's bar the one we
 * are looking at, has an open position run out of time, and what stop and
 * target should the broker be given.
 */
import { computeSignals, DEFAULT_PARAMS, type PrimerSaltoParams } from "@/lib/study/primer-salto";
import type { Bar } from "@/lib/quant/types";

export const PRIMER_SALTO_STRATEGY = "primer-salto";

/** Trading date of a bar in America/New_York, as YYYY-MM-DD. */
export function tradingDate(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

/**
 * What the market looked like when the signal fired.
 *
 * Recorded on every entry from day one even though nothing filters on it
 * yet. The alternative — deciding later that regime or volatility matters
 * and having no way to look back — is how a year of paper trading turns into
 * a year of unanswerable questions. Cheap to write, impossible to
 * reconstruct after the fact.
 */
export interface EntryContext {
  /** ATR as a fraction of price: how volatile this name is right now. */
  atrPct: number;
  /** RSI at the signal bar — how deep the exhaustion was. */
  rsi: number | null;
  /** Stop distance as a fraction of the entry price. */
  stopDistancePct: number;
  /** Distance from the 40-day mean, as a fraction: how far it had fallen. */
  distanceFromSlowMaPct: number | null;
  /** Whether the exhaustion rule was in force for this signal. */
  strictMode: boolean;
  /** How far below its own 52-week high the stock had fallen, as a fraction. */
  pctOff52WeekHigh: number | null;
}

/** Market-wide backdrop at the moment of entry, recorded alongside the trade. */
export interface MarketContext {
  spyAboveMa200: boolean | null;
  spyAboveMa20: boolean | null;
}

/** Is SPY above the given moving average right now? */
export function marketContext(spyCloses: number[]): MarketContext {
  const meanOf = (n: number): number | null => {
    if (spyCloses.length < n) return null;
    const slice = spyCloses.slice(-n);
    return slice.reduce((a, b) => a + b, 0) / n;
  };
  const last = spyCloses.length > 0 ? spyCloses[spyCloses.length - 1] : null;
  const ma200 = meanOf(200);
  const ma20 = meanOf(20);
  return {
    spyAboveMa200: last === null || ma200 === null ? null : last > ma200,
    spyAboveMa20: last === null || ma20 === null ? null : last > ma20,
  };
}

/** Drawdown from the highest high of the last `lookback` bars. */
export function pctOffHigh(bars: Bar[], lookback = 252): number | null {
  const window = bars.slice(-lookback);
  if (window.length === 0) return null;
  const high = Math.max(...window.map((b) => b.high));
  const last = window[window.length - 1].close;
  if (high <= 0) return null;
  return (last - high) / high;
}

export interface EntryPlan {
  /** Close of the signal bar — what the order is sized against. */
  price: number;
  stopPrice: number;
  targetPrice: number;
  entryDate: string;
  /** Risk per share, i.e. price − stop. Always positive. */
  riskPerShare: number;
  context: EntryContext;
}

/**
 * Is the LAST bar a Primer Salto signal, and if so what are its levels?
 *
 * Only the last bar counts. An older signal is not actionable: its stop and
 * target were computed from a bar whose day has closed, and the strategy
 * enters at that bar's close or not at all.
 */
export function planEntry(
  bars: Bar[],
  params: PrimerSaltoParams = DEFAULT_PARAMS,
): EntryPlan | null {
  if (bars.length === 0) return null;
  const { long, atr, rsi, maSlow } = computeSignals(bars, params);
  const i = bars.length - 1;
  if (!long[i]) return null;

  const a = atr[i];
  if (a === null) return null;

  const bar = bars[i];
  const stopPrice = bar.low - params.atrStopMult * a;
  const riskPerShare = bar.close - stopPrice;
  // A stop at or above the entry is not a stop. It can happen when the ATR is
  // tiny relative to the bar; the trade has no defined risk, so skip it.
  if (riskPerShare <= 0) return null;

  const slow = maSlow[i];
  return {
    price: bar.close,
    stopPrice,
    targetPrice: bar.close + params.rMult * riskPerShare,
    entryDate: tradingDate(bar.ts),
    riskPerShare,
    context: {
      atrPct: a / bar.close,
      rsi: rsi[i],
      stopDistancePct: riskPerShare / bar.close,
      distanceFromSlowMaPct: slow !== null && slow > 0 ? (bar.close - slow) / slow : null,
      strictMode: params.useExhaust,
      pctOff52WeekHigh: pctOffHigh(bars),
    },
  };
}

/**
 * Trading sessions elapsed since entry, counted from the bar dates the data
 * actually contains — never from the calendar. Weekends and holidays are not
 * sessions, and the strategy's "20 bars" means 20 bars.
 */
export function sessionsSinceEntry(barDates: string[], entryDate: string): number | null {
  const idx = barDates.lastIndexOf(entryDate);
  if (idx === -1) return null;
  return barDates.length - 1 - idx;
}

export interface OpenPosition {
  symbol: string;
  entryDate: string;
  maxBars: number;
}

export type TimeExitDecision =
  | { close: false; reason: string }
  | { close: true; reason: string; sessionsHeld: number };

/** Has this position used up its time budget? */
export function decideTimeExit(
  position: OpenPosition,
  barDates: string[],
): TimeExitDecision {
  if (position.maxBars <= 0) return { close: false, reason: "time exit disabled" };
  const held = sessionsSinceEntry(barDates, position.entryDate);
  if (held === null) {
    return { close: false, reason: `entry date ${position.entryDate} not found in the bars` };
  }
  if (held >= position.maxBars) {
    return {
      close: true,
      reason: `held ${held} sessions (limit ${position.maxBars}) — the jump thesis expired`,
      sessionsHeld: held,
    };
  }
  return { close: false, reason: `held ${held} of ${position.maxBars} sessions` };
}

export interface RiskSizingInput {
  equity: number;
  /** Fraction of equity to put at risk, e.g. 0.005 for 0.5%. */
  riskPct: number;
  entryPrice: number;
  stopPrice: number;
  /** Hard ceiling on position value, whatever the risk maths says. */
  maxPositionUsd: number;
}

export interface Sizing {
  shares: number;
  notionalUsd: number;
  /** Dollars actually at risk if the stop fills. */
  riskUsd: number;
  /** Which constraint decided the size, for the activity log. */
  boundBy: "risk" | "position-cap" | "none";
}

/**
 * Size a position by the risk it carries rather than the dollars it costs.
 *
 * With a fixed dollar size, a name whose stop sits 10% away risks two and a
 * half times as much as one whose stop is 4% away, for no reason anybody
 * chose. Sizing off the stop distance equalises that.
 *
 * The position cap is not decoration. On a small account the risk maths can
 * ask for far more than the account holds: risking 2% of $3,000 behind a 4%
 * stop wants a $1,500 position — half the account in one name, and six of
 * those is $9,000 of exposure on $3,000 of cash, which is margin whatever
 * else it is called. The cap is what keeps the arithmetic honest, and when
 * it binds the effective risk is lower than the configured percentage.
 */
export function riskBasedShares(input: RiskSizingInput): Sizing {
  const riskPerShare = input.entryPrice - input.stopPrice;
  if (riskPerShare <= 0 || input.entryPrice <= 0 || input.riskPct <= 0 || input.equity <= 0) {
    return { shares: 0, notionalUsd: 0, riskUsd: 0, boundBy: "none" };
  }

  const riskBudget = input.equity * input.riskPct;
  const byRisk = Math.floor(riskBudget / riskPerShare);
  const byCap = Math.floor(input.maxPositionUsd / input.entryPrice);
  const shares = Math.max(0, Math.min(byRisk, byCap));

  return {
    shares,
    notionalUsd: shares * input.entryPrice,
    riskUsd: shares * riskPerShare,
    boundBy: shares === 0 ? "none" : byCap < byRisk ? "position-cap" : "risk",
  };
}

/** Whole shares only; Alpaca brackets cannot take fractions. */
export function sharesFor(notionalUsd: number, price: number): number {
  if (price <= 0) return 0;
  return Math.floor(notionalUsd / price);
}

export type SkipReason =
  | "no-signal"
  | "already-holding"
  | "position-cap"
  | "not-enough-history"
  | "too-small";

export type SymbolDecision =
  | { act: "buy"; plan: EntryPlan; shares: number; sizing: Sizing }
  | { act: "skip"; why: SkipReason; detail: string };

export interface DecideInput {
  bars: Bar[];
  hasPosition: boolean;
  openStrategyPositions: number;
  maxConcurrent: number;
  /** Fixed dollars per trade, used when riskPct is 0. */
  notionalUsd: number;
  /** Account equity, for risk-based sizing. */
  equity?: number;
  /** Fraction of equity to risk per trade. 0 keeps the fixed-dollar path. */
  riskPct?: number;
  /** Ceiling on position value under risk sizing. */
  maxPositionUsd?: number;
  params?: PrimerSaltoParams;
  /** Bars needed before the indicators mean anything. */
  minBars?: number;
}

/**
 * The whole per-symbol decision, with no I/O. The broker-level safeguards
 * (exposure caps, daily loss, cooldown) run separately and can still refuse
 * an order this returns — this is the strategy's own answer, not the last
 * word.
 */
export function decideForSymbol(input: DecideInput): SymbolDecision {
  const minBars = input.minBars ?? 60;
  if (input.bars.length < minBars) {
    return {
      act: "skip",
      why: "not-enough-history",
      detail: `${input.bars.length} bars, need ${minBars}`,
    };
  }
  if (input.hasPosition) {
    return { act: "skip", why: "already-holding", detail: "already holding this symbol" };
  }
  if (input.openStrategyPositions >= input.maxConcurrent) {
    return {
      act: "skip",
      why: "position-cap",
      detail: `${input.openStrategyPositions} open, max ${input.maxConcurrent}`,
    };
  }

  const plan = planEntry(input.bars, input.params);
  if (!plan) return { act: "skip", why: "no-signal", detail: "checklist not met on the last bar" };

  const useRisk = (input.riskPct ?? 0) > 0 && (input.equity ?? 0) > 0;
  const sizing: Sizing = useRisk
    ? riskBasedShares({
        equity: input.equity!,
        riskPct: input.riskPct!,
        entryPrice: plan.price,
        stopPrice: plan.stopPrice,
        maxPositionUsd: input.maxPositionUsd ?? input.notionalUsd,
      })
    : {
        shares: sharesFor(input.notionalUsd, plan.price),
        notionalUsd: sharesFor(input.notionalUsd, plan.price) * plan.price,
        riskUsd: sharesFor(input.notionalUsd, plan.price) * plan.riskPerShare,
        boundBy: "none",
      };

  if (sizing.shares < 1) {
    const budget = useRisk ? (input.maxPositionUsd ?? input.notionalUsd) : input.notionalUsd;
    return {
      act: "skip",
      why: "too-small",
      detail: `$${budget} buys less than one share at $${plan.price.toFixed(2)}`,
    };
  }
  return { act: "buy", plan, shares: sizing.shares, sizing };
}

/**
 * How many positions the strategy may hold at once, given the money set
 * aside for it. Trading more signals than the account can carry forces
 * arbitrary choices between them, and the study showed that picking among
 * signals is exactly what does not work.
 */
export function maxConcurrentPositions(totalExposureUsd: number, notionalUsd: number): number {
  if (notionalUsd <= 0) return 0;
  return Math.max(1, Math.floor(totalExposureUsd / notionalUsd));
}

/** Round to cents; brokers reject prices with more precision. */
export function toCents(price: number): number {
  return Number(price.toFixed(2));
}

/**
 * The order to scan symbols in on a given day.
 *
 * This matters more than it looks. Mean reversion fires in CLUSTERS — the
 * market sells off, dozens of names go oversold together, and then they all
 * jump on the same day. When more signals appear than there are slots, the
 * scan order decides which ones get taken.
 *
 * Walking the universe in list order hands every cluster to whatever sits at
 * the front of the array, forever. AAPL and ABT would be bought hundreds of
 * times and XOM never, not because they are better but because of the
 * alphabet. That is a systematic bias with no justification behind it.
 *
 * There is no evidence that any symbol deserves priority — three separate
 * studies failed to find one — so the honest choice is to give them all an
 * equal chance. The shuffle is seeded by the trading date so a given day is
 * reproducible (the same scan re-run gives the same answer) while the
 * ordering varies from day to day.
 */
export function scanOrder(symbols: readonly string[], seedDate: string): string[] {
  const rand = splitmix32(hashString(seedDate));
  const out = [...symbols];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * FNV-1a. A weaker hash here is not a cosmetic problem: consecutive dates
 * differ by one character, and a poorly mixed seed makes consecutive days
 * produce correlated shuffles — which puts the same symbols near the front
 * over and over, reviving the very bias the shuffle exists to remove.
 */
function hashString(value: string): number {
  let h = 2_166_136_261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16_777_619) >>> 0;
  }
  return h;
}

/** splitmix32: small, fast, and well distributed from nearby seeds. */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e_37_79_b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
