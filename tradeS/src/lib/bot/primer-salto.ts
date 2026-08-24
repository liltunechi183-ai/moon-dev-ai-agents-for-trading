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

export interface EntryPlan {
  /** Close of the signal bar — what the order is sized against. */
  price: number;
  stopPrice: number;
  targetPrice: number;
  entryDate: string;
  /** Risk per share, i.e. price − stop. Always positive. */
  riskPerShare: number;
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
  const { long, atr } = computeSignals(bars, params);
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

  return {
    price: bar.close,
    stopPrice,
    targetPrice: bar.close + params.rMult * riskPerShare,
    entryDate: tradingDate(bar.ts),
    riskPerShare,
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
  | { act: "buy"; plan: EntryPlan; shares: number }
  | { act: "skip"; why: SkipReason; detail: string };

export interface DecideInput {
  bars: Bar[];
  hasPosition: boolean;
  openStrategyPositions: number;
  maxConcurrent: number;
  notionalUsd: number;
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

  const shares = sharesFor(input.notionalUsd, plan.price);
  if (shares < 1) {
    return {
      act: "skip",
      why: "too-small",
      detail: `$${input.notionalUsd} buys less than one share at $${plan.price.toFixed(2)}`,
    };
  }
  return { act: "buy", plan, shares };
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
