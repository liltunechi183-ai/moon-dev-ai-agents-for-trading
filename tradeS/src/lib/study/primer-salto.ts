/**
 * "Primer Salto" — a faithful TypeScript port of the Pine v6 strategy, so the
 * same rules can be run across a large symbol universe offline.
 *
 * This is a STUDY tool, separate from the app: nothing here touches the
 * database, the bot, or any broker. It exists to answer one question — which
 * symbols does this strategy actually fit, and does that fit survive on data
 * the selection never saw.
 *
 * Ported rule for rule from the Pine source, including the indexing (Pine's
 * `x[1]` is the previous bar). Where Pine leaves something ambiguous the
 * choice here is the pessimistic one, and it is called out in a comment.
 */
import { sma, rsi, atr } from "@/lib/quant/indicators";
import type { Bar } from "@/lib/quant/types";

export interface PrimerSaltoParams {
  /** 1) Minimum days of prior trend inside the lookback window. */
  trendDays: number;
  /** 1) Window the trend days are counted in. */
  trendWindow: number;
  /** 2) Require an RSI-extreme touch (strict mode). Off = frequency mode. */
  useExhaust: boolean;
  rsiLen: number;
  rsiOS: number;
  maFastLen: number;
  maSlowLen: number;
  /** 5) Optional proxy for the macro filter: skip abnormally wide bars. */
  useNewsFilter: boolean;
  newsAtrMult: number;
  atrLen: number;
  /** Stop sits this many ATRs below the signal bar's low. */
  atrStopMult: number;
  /** Target as a multiple of the risk taken. */
  rMult: number;
  /** Give up after this many bars. 0 disables. */
  maxBars: number;
  /** One-way cost, as a fraction (0.0005 = 0.05%), charged on entry and exit. */
  commissionPct: number;
}

/**
 * The Pine script's values, with one correction.
 *
 * Its header calls 0.5*ATR "validated", but that came from a sweep over ten
 * or so symbols — the same small-sample flaw this repo's own study found in a
 * profit factor quoted from ten symbols. Swept over all 69 symbols here
 * (scripts/primer-salto-sweep.ts), 0.5 is the WEAKEST width tested on every
 * measure and in both windows, while 1.0 is the peak out of sample on average
 * R (0.463) and profit factor (2.30), and within noise of the best on percent
 * per trade. It is also the width that does not depend on how positions are
 * sized, which removes a coupled decision rather than betting on it.
 */
export const DEFAULT_PARAMS: PrimerSaltoParams = {
  trendDays: 5,
  trendWindow: 10,
  useExhaust: true,
  rsiLen: 14,
  rsiOS: 35,
  maFastLen: 20,
  maSlowLen: 40,
  useNewsFilter: false,
  newsAtrMult: 2.5,
  atrLen: 14,
  atrStopMult: 1.0,
  rMult: 3.0,
  maxBars: 20,
  commissionPct: 0.0005,
};

export type ExitReason = "stop" | "target" | "time" | "open";

export interface Trade {
  entryIndex: number;
  /** Epoch ms of the entry bar, matching Bar.ts. */
  entryTs: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  exitIndex: number | null;
  exitTs: number | null;
  exitPrice: number | null;
  exitReason: ExitReason;
  /** Net of commission, as a fraction (0.023 = +2.3%). */
  returnPct: number;
}

/** Rolling count of a boolean series over `len` bars ending at each index. */
function rollingCount(flags: boolean[], len: number): (number | null)[] {
  const out: (number | null)[] = new Array(flags.length).fill(null);
  let running = 0;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) running += 1;
    if (i >= len && flags[i - len]) running -= 1;
    if (i >= len - 1) out[i] = running;
  }
  return out;
}

/** Lowest value of a series over the `len` bars ending at each index. */
function rollingLowest(values: (number | null)[], len: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = len - 1; i < values.length; i++) {
    let lo: number | null = null;
    let complete = true;
    for (let k = i - len + 1; k <= i; k++) {
      const v = values[k];
      if (v === null) {
        complete = false;
        break;
      }
      lo = lo === null || v < lo ? v : lo;
    }
    out[i] = complete ? lo : null;
  }
  return out;
}

export interface SignalSeries {
  long: boolean[];
  maFast: (number | null)[];
  maSlow: (number | null)[];
  rsi: (number | null)[];
  atr: (number | null)[];
}

/**
 * The long side of the checklist, bar by bar. Short signals are deliberately
 * absent: the Pine header records that shorts dilute the edge on stocks
 * (PF 1.13), and the validated configuration is long-only.
 */
export function computeSignals(bars: Bar[], params: PrimerSaltoParams): SignalSeries {
  const closes = bars.map((b) => b.close);
  const maFast = sma(closes, params.maFastLen);
  const maSlow = sma(closes, params.maSlowLen);
  const rsiSeries = rsi(closes, params.rsiLen);
  const atrSeries = atr(bars, params.atrLen);

  const winLen = Math.max(params.trendWindow, params.trendDays);
  const belowFlags = bars.map((b, i) => {
    const m = maFast[i];
    return m !== null && b.close < m;
  });
  const belowCnt = rollingCount(belowFlags, winLen);
  const rsiLowest6 = rollingLowest(rsiSeries, 6);

  const long: boolean[] = new Array(bars.length).fill(false);

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const prev = bars[i - 1];
    const mf = maFast[i];
    const ms = maSlow[i];
    const mfPrev = maFast[i - 1];
    const msPrev = maSlow[i - 1];
    const a = atrSeries[i];
    if (mf === null || ms === null || mfPrev === null || msPrev === null || a === null) continue;

    // 1) Prior downtrend: enough closes below the fast MA in the window, and
    //    the fast MA itself falling. Both read the PREVIOUS bar, as in Pine.
    const cntPrev = belowCnt[i - 1];
    const mfBack = maFast[i - params.trendDays];
    if (cntPrev === null || mfBack === null || mfBack === undefined) continue;
    const downTrendPrev = cntPrev >= params.trendDays && mfPrev < mfBack;
    if (!downTrendPrev) continue;

    // 2) Exhaustion: RSI touched oversold in the last 6 bars.
    const lowest = rsiLowest6[i];
    const exhaustLong = !params.useExhaust || (lowest !== null && lowest < params.rsiOS);
    if (!exhaustLong) continue;

    // 3) Break of BOTH means, coming from below at least one of them. The
    //    Pine header is explicit that requiring both is what carries the edge.
    const breakUp = bar.close > mf && bar.close > ms && (prev.close < mfPrev || prev.close < msPrev);
    if (!breakUp) continue;

    // 4) The jump bar itself: takes out yesterday's high, closes up, and does
    //    not give the move back.
    const jumpUp = bar.close > prev.high && bar.close > bar.open && bar.close > prev.close;
    if (!jumpUp) continue;

    // 5) Macro isolation, proxied by rejecting abnormally wide bars.
    const rangeOK = !params.useNewsFilter || bar.high - bar.low < params.newsAtrMult * a;
    if (!rangeOK) continue;

    long[i] = true;
  }

  return { long, maFast, maSlow, rsi: rsiSeries, atr: atrSeries };
}

/**
 * Walk the bars and turn signals into round trips. Entry is at the signal
 * bar's close (the Pine runs with process_orders_on_close), one position at a
 * time, exits by stop, target, or the time limit.
 */
export function simulate(bars: Bar[], params: PrimerSaltoParams = DEFAULT_PARAMS): Trade[] {
  const { long, atr: atrSeries } = computeSignals(bars, params);
  const trades: Trade[] = [];
  let i = 0;

  while (i < bars.length) {
    if (!long[i]) {
      i += 1;
      continue;
    }
    const entryBar = bars[i];
    const a = atrSeries[i];
    if (a === null) {
      i += 1;
      continue;
    }
    const entryPrice = entryBar.close;
    const stopPrice = entryBar.low - params.atrStopMult * a;
    const risk = entryPrice - stopPrice;
    if (risk <= 0) {
      i += 1;
      continue;
    }
    const targetPrice = entryPrice + params.rMult * risk;

    let exitIndex: number | null = null;
    let exitPrice: number | null = null;
    let exitReason: ExitReason = "open";

    for (let j = i + 1; j < bars.length; j++) {
      const b = bars[j];
      // When a bar spans both levels the daily data cannot say which came
      // first, so assume the stop — the pessimistic reading.
      if (b.low <= stopPrice) {
        exitIndex = j;
        exitPrice = stopPrice;
        exitReason = "stop";
        break;
      }
      if (b.high >= targetPrice) {
        exitIndex = j;
        exitPrice = targetPrice;
        exitReason = "target";
        break;
      }
      if (params.maxBars > 0 && j - i >= params.maxBars) {
        exitIndex = j;
        exitPrice = b.close;
        exitReason = "time";
        break;
      }
    }

    if (exitIndex === null) {
      // Still open at the end of the data: excluded from the statistics
      // rather than marked to market, so an unresolved bet cannot flatter
      // the results.
      break;
    }

    const gross = exitPrice! / entryPrice - 1;
    const returnPct = gross - 2 * params.commissionPct;

    trades.push({
      entryIndex: i,
      entryTs: entryBar.ts,
      entryPrice,
      stopPrice,
      targetPrice,
      exitIndex,
      exitTs: bars[exitIndex].ts,
      exitPrice,
      exitReason,
      returnPct,
    });

    i = exitIndex + 1;
  }

  return trades;
}

export interface Stats {
  trades: number;
  wins: number;
  winRate: number | null;
  /** Gross wins / gross losses. null when there were no losses to divide by. */
  profitFactor: number | null;
  avgReturnPct: number | null;
  /** Compounded return if every signal were taken at full size, in order. */
  totalReturnPct: number | null;
  tradesPerYear: number | null;
  /** Worst peak-to-trough on the compounded equity curve. */
  maxDrawdownPct: number | null;
  /**
   * Average result in multiples of the risk taken (R).
   *
   * This and avgReturnPct answer DIFFERENT questions, and which one matters
   * depends on how positions are sized. Betting a fixed dollar amount per
   * trade makes avgReturnPct the yardstick — every trade deploys the same
   * capital, so percent return is the return. Betting a fixed fraction of the
   * account as RISK makes avgR the yardstick — a wider stop buys fewer shares,
   * so the percent move matters less than how many multiples of the risk it
   * covered. A stop width can look good on one and bad on the other, which is
   * why stop width and sizing method are a single decision, not two.
   */
  avgR: number | null;
}

export function summarize(trades: Trade[], years: number): Stats {
  if (trades.length === 0) {
    return {
      trades: 0,
      wins: 0,
      winRate: null,
      profitFactor: null,
      avgReturnPct: null,
      totalReturnPct: null,
      tradesPerYear: years > 0 ? 0 : null,
      maxDrawdownPct: null,
      avgR: null,
    };
  }

  const wins = trades.filter((t) => t.returnPct > 0);
  const grossWin = wins.reduce((s, t) => s + t.returnPct, 0);
  const grossLoss = trades.filter((t) => t.returnPct <= 0).reduce((s, t) => s - t.returnPct, 0);

  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const t of trades) {
    equity *= 1 + t.returnPct;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
  }

  return {
    trades: trades.length,
    wins: wins.length,
    winRate: wins.length / trades.length,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    avgReturnPct: trades.reduce((s, t) => s + t.returnPct, 0) / trades.length,
    totalReturnPct: equity - 1,
    tradesPerYear: years > 0 ? trades.length / years : null,
    maxDrawdownPct: maxDd,
    avgR: averageR(trades),
  };
}

/**
 * Mean result in R. Risk is measured at the entry — (entry − stop) / entry —
 * so a trade that ran to its 3R target scores near +3 whatever the stop's
 * width, and one that stopped out scores near −1. Trades with no defined
 * risk are excluded rather than counted as zero, which would quietly drag
 * the average toward the middle.
 */
export function averageR(trades: Trade[]): number | null {
  const usable = trades.filter((t) => t.entryPrice > t.stopPrice && t.entryPrice > 0);
  if (usable.length === 0) return null;
  const total = usable.reduce((sum, t) => {
    const riskPct = (t.entryPrice - t.stopPrice) / t.entryPrice;
    return sum + t.returnPct / riskPct;
  }, 0);
  return total / usable.length;
}

/**
 * Did this symbol stay profitable? Uses the average trade rather than the
 * profit factor, which is undefined when there were no losses at all — a
 * perfect record, not a failure. With equal-weighted trades the two agree
 * everywhere else (PF > 1 exactly when the average is positive), so this is
 * the same test with one fewer way to be wrong.
 */
export function stayedProfitable(stats: Stats): boolean {
  return stats.trades > 0 && (stats.avgReturnPct ?? 0) > 0;
}

/** Keep only the trades ENTERED inside [fromTs, toTs). */
export function tradesInWindow(trades: Trade[], fromTs: number, toTs: number): Trade[] {
  return trades.filter((t) => t.entryTs >= fromTs && t.entryTs < toTs);
}

/**
 * Median dollar volume over the most recent `lookback` bars.
 *
 * The median rather than the mean on purpose: one earnings day with twenty
 * times normal turnover should not make a thinly traded name look liquid.
 * This is the "can I actually get filled here?" test, and it is applied to
 * candidate symbols before they join a universe — a mechanical gate, so that
 * which names get added is decided by the data rather than by whoever wrote
 * the list.
 */
export function medianDollarVolume(bars: Bar[], lookback = 60): number | null {
  const recent = bars.slice(-lookback).filter((b) => b.volume > 0 && b.close > 0);
  if (recent.length === 0) return null;
  const values = recent.map((b) => b.close * b.volume).sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

export interface EligibilityInput {
  bars: Bar[];
  minBars: number;
  minDollarVolume: number;
}

export type Eligibility =
  | { eligible: true; dollarVolume: number }
  | { eligible: false; why: "not-enough-history" | "too-illiquid" | "no-volume"; detail: string };

/** Does this candidate belong in the universe at all? */
export function checkEligibility(input: EligibilityInput): Eligibility {
  if (input.bars.length < input.minBars) {
    return {
      eligible: false,
      why: "not-enough-history",
      detail: `${input.bars.length} bars, need ${input.minBars}`,
    };
  }
  const dv = medianDollarVolume(input.bars);
  if (dv === null) {
    return { eligible: false, why: "no-volume", detail: "no usable volume data" };
  }
  if (dv < input.minDollarVolume) {
    return {
      eligible: false,
      why: "too-illiquid",
      detail: `$${(dv / 1e6).toFixed(1)}M/day, need $${(input.minDollarVolume / 1e6).toFixed(0)}M`,
    };
  }
  return { eligible: true, dollarVolume: dv };
}
