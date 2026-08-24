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

/** The values the Pine script ships with, i.e. the validated configuration. */
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
  atrStopMult: 0.5,
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
  };
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
