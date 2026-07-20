import type { Bar } from "./types";
import { sma } from "./indicators";

export type PatternType = "breakout" | "pullback" | "golden-cross" | "death-cross" | "support" | "resistance";

export interface Pattern {
  type: PatternType;
  ts: number;
  price: number;
  description: string;
}

/** Breakout: close crosses above the prior N-bar high on volume >= 150% of the 20-day average. */
export function detectBreakout(bars: Bar[], lookback = 20): Pattern | null {
  if (bars.length < lookback + 21) return null;
  const last = bars[bars.length - 1];
  const priorWindow = bars.slice(bars.length - 1 - lookback, bars.length - 1);
  const priorHigh = Math.max(...priorWindow.map((b) => b.high));

  const volumes = bars.map((b) => b.volume);
  const avgVol20 = sma(volumes, 20)[bars.length - 1];

  if (last.close > priorHigh && avgVol20 && last.volume >= 1.5 * avgVol20) {
    return {
      type: "breakout",
      ts: last.ts,
      price: last.close,
      description: `Closed above the prior ${lookback}-bar high on ${(last.volume / avgVol20).toFixed(1)}x average volume.`,
    };
  }
  return null;
}

/** Pullback: uptrend (price above SMA50) with a dip to SMA20/SMA50 and RSI 35-50 resuming up. */
export function detectPullback(bars: Bar[], rsi14: (number | null)[]): Pattern | null {
  if (bars.length < 50) return null;
  const closes = bars.map((b) => b.close);
  const sma20Arr = sma(closes, 20);
  const sma50Arr = sma(closes, 50);
  const lastIdx = bars.length - 1;
  const last = bars[lastIdx];
  const s20 = sma20Arr[lastIdx];
  const s50 = sma50Arr[lastIdx];
  const r = rsi14[lastIdx];

  if (s20 === null || s50 === null || r === null) return null;
  const uptrend = last.close > s50;
  const nearMa = Math.abs(last.close - s20) / s20 < 0.03 || Math.abs(last.close - s50) / s50 < 0.03;
  const resumingUp = last.close > bars[lastIdx - 1].close;

  if (uptrend && nearMa && r >= 35 && r <= 50 && resumingUp) {
    return {
      type: "pullback",
      ts: last.ts,
      price: last.close,
      description: "Uptrend pullback to the 20/50-day average with RSI resuming up from 35-50.",
    };
  }
  return null;
}

/** Golden/death cross: SMA50 crossing SMA200. */
export function detectCrossovers(bars: Bar[]): Pattern[] {
  if (bars.length < 201) return [];
  const closes = bars.map((b) => b.close);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const lastIdx = bars.length - 1;
  const prevIdx = lastIdx - 1;

  const prev50 = s50[prevIdx];
  const prev200 = s200[prevIdx];
  const cur50 = s50[lastIdx];
  const cur200 = s200[lastIdx];
  if (prev50 === null || prev200 === null || cur50 === null || cur200 === null) return [];

  const patterns: Pattern[] = [];
  if (prev50 <= prev200 && cur50 > cur200) {
    patterns.push({
      type: "golden-cross",
      ts: bars[lastIdx].ts,
      price: bars[lastIdx].close,
      description: "SMA50 crossed above SMA200 (golden cross).",
    });
  } else if (prev50 >= prev200 && cur50 < cur200) {
    patterns.push({
      type: "death-cross",
      ts: bars[lastIdx].ts,
      price: bars[lastIdx].close,
      description: "SMA50 crossed below SMA200 (death cross).",
    });
  }
  return patterns;
}

/** Support/resistance: local swing highs/lows within the recent window, clustered by proximity. */
export function detectSupportResistance(bars: Bar[], window = 60, swingSpan = 3): Pattern[] {
  const recent = bars.slice(-window);
  if (recent.length < swingSpan * 2 + 1) return [];

  const patterns: Pattern[] = [];
  for (let i = swingSpan; i < recent.length - swingSpan; i++) {
    const slice = recent.slice(i - swingSpan, i + swingSpan + 1);
    const cur = recent[i];
    const isSwingHigh = slice.every((b) => b.high <= cur.high);
    const isSwingLow = slice.every((b) => b.low >= cur.low);
    if (isSwingHigh) {
      patterns.push({
        type: "resistance",
        ts: cur.ts,
        price: cur.high,
        description: `Local swing high near ${cur.high.toFixed(2)}.`,
      });
    }
    if (isSwingLow) {
      patterns.push({
        type: "support",
        ts: cur.ts,
        price: cur.low,
        description: `Local swing low near ${cur.low.toFixed(2)}.`,
      });
    }
  }
  // Keep only the most recent support and resistance level to avoid clutter.
  const lastResistance = [...patterns].reverse().find((p) => p.type === "resistance");
  const lastSupport = [...patterns].reverse().find((p) => p.type === "support");
  return [lastSupport, lastResistance].filter((p): p is Pattern => p != null);
}

export function detectPatterns(bars: Bar[], rsi14: (number | null)[]): Pattern[] {
  const patterns: Pattern[] = [];
  const breakout = detectBreakout(bars);
  if (breakout) patterns.push(breakout);
  const pullback = detectPullback(bars, rsi14);
  if (pullback) patterns.push(pullback);
  patterns.push(...detectCrossovers(bars));
  patterns.push(...detectSupportResistance(bars));
  return patterns;
}
