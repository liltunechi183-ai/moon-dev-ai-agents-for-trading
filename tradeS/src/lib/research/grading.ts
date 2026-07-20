export type Outlook = "bullish" | "neutral" | "bearish";

/**
 * Volatility-scaled neutral band, in percent. A flat ±3% band over-grades
 * calm stocks and under-grades wild ones; scale by the stock's ATR% and the
 * horizon instead: ~0.5 * atrPct * sqrt(tradingDays), clamped to 3-15%.
 * Falls back to 3% when ATR is unknown.
 */
export function neutralBandFor(atrPct: number | null | undefined, horizonDays: number): number {
  if (atrPct == null || !Number.isFinite(atrPct) || atrPct <= 0) return 3;
  const tradingDays = Math.max(1, horizonDays * (5 / 7));
  const band = 0.5 * atrPct * Math.sqrt(tradingDays);
  return Math.min(15, Math.max(3, band));
}

/**
 * Directional grading: bullish is correct when the return is positive,
 * bearish when negative, neutral when the move stayed inside the band.
 */
export function gradeDirection(outlook: Outlook, returnPct: number, neutralBandPct: number): boolean {
  switch (outlook) {
    case "bullish":
      return returnPct > 0;
    case "bearish":
      return returnPct < 0;
    case "neutral":
      return Math.abs(returnPct) <= neutralBandPct;
  }
}

export interface GradingWindow {
  entryPrice: number;
  horizonPrice: number;
  returnPct: number;
  /** Closes from entry (exclusive) through horizon (inclusive). */
  pathCloses: number[];
}

/**
 * Extract the grading window from a daily bar series (pure). Entry = last
 * close at/before entryTs; horizon = first close at/after horizonTs.
 * Returns null when the series doesn't yet cover the horizon (not matured)
 * or has no bar at/before entry.
 */
export function extractGradingWindow(
  bars: Array<{ ts: number; close: number }>,
  entryTs: number,
  horizonTs: number,
): GradingWindow | null {
  let entryIdx = -1;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].ts <= entryTs) entryIdx = i;
    else break;
  }
  if (entryIdx === -1) return null;

  let horizonIdx = -1;
  for (let i = entryIdx + 1; i < bars.length; i++) {
    if (bars[i].ts >= horizonTs) {
      horizonIdx = i;
      break;
    }
  }
  if (horizonIdx === -1) return null; // not matured yet

  const entryPrice = bars[entryIdx].close;
  const horizonPrice = bars[horizonIdx].close;
  return {
    entryPrice,
    horizonPrice,
    returnPct: ((horizonPrice - entryPrice) / entryPrice) * 100,
    pathCloses: bars.slice(entryIdx + 1, horizonIdx + 1).map((b) => b.close),
  };
}

export interface PathStats {
  maxDrawdownPct: number; // worst close vs entry, <= 0
  maxGainPct: number; // best close vs entry, >= 0
}

/** Path-aware stats over the closes between entry and horizon (inclusive). */
export function computePathStats(entryPrice: number, closes: number[]): PathStats {
  let maxDrawdownPct = 0;
  let maxGainPct = 0;
  for (const close of closes) {
    const pct = ((close - entryPrice) / entryPrice) * 100;
    if (pct < maxDrawdownPct) maxDrawdownPct = pct;
    if (pct > maxGainPct) maxGainPct = pct;
  }
  return { maxDrawdownPct, maxGainPct };
}
