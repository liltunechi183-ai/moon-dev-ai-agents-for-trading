import { describe, it, expect } from "vitest";
import {
  neutralBandFor,
  gradeDirection,
  computePathStats,
  extractGradingWindow,
} from "@/lib/research/grading";

describe("neutralBandFor", () => {
  it("falls back to 3% when ATR is unknown", () => {
    expect(neutralBandFor(null, 30)).toBe(3);
    expect(neutralBandFor(undefined, 30)).toBe(3);
    expect(neutralBandFor(0, 30)).toBe(3);
  });

  it("scales with volatility and horizon", () => {
    const calm = neutralBandFor(1, 30); // ~0.5 * 1 * sqrt(21.4) ≈ 2.3 → clamped to 3
    const wild = neutralBandFor(4, 30); // ~0.5 * 4 * sqrt(21.4) ≈ 9.3
    expect(calm).toBe(3);
    expect(wild).toBeGreaterThan(8);
    expect(wild).toBeLessThan(11);
  });

  it("clamps to the 3-15% range", () => {
    expect(neutralBandFor(0.1, 5)).toBe(3);
    expect(neutralBandFor(10, 365)).toBe(15);
  });

  it("longer horizons widen the band", () => {
    expect(neutralBandFor(3, 60)).toBeGreaterThan(neutralBandFor(3, 10));
  });
});

describe("gradeDirection", () => {
  it("bullish is correct only on positive returns", () => {
    expect(gradeDirection("bullish", 5, 3)).toBe(true);
    expect(gradeDirection("bullish", -2, 3)).toBe(false);
    expect(gradeDirection("bullish", 0, 3)).toBe(false);
  });

  it("bearish is correct only on negative returns", () => {
    expect(gradeDirection("bearish", -5, 3)).toBe(true);
    expect(gradeDirection("bearish", 2, 3)).toBe(false);
  });

  it("neutral is correct inside the band, wrong outside", () => {
    expect(gradeDirection("neutral", 2.5, 3)).toBe(true);
    expect(gradeDirection("neutral", -3, 3)).toBe(true);
    expect(gradeDirection("neutral", 4, 3)).toBe(false);
    expect(gradeDirection("neutral", -8, 3)).toBe(false);
  });
});

describe("extractGradingWindow", () => {
  const DAY = 86_400_000;
  const bars = Array.from({ length: 40 }, (_, i) => ({ ts: i * DAY, close: 100 + i }));

  it("uses last close at/before entry and first close at/after horizon", () => {
    const w = extractGradingWindow(bars, 10 * DAY + 1000, 20 * DAY);
    expect(w).not.toBeNull();
    expect(w!.entryPrice).toBe(110); // bar at day 10
    expect(w!.horizonPrice).toBe(120); // bar at day 20
    expect(w!.returnPct).toBeCloseTo((10 / 110) * 100);
    expect(w!.pathCloses).toHaveLength(10); // days 11..20
  });

  it("returns null when the horizon is not yet covered (not matured)", () => {
    expect(extractGradingWindow(bars, 10 * DAY, 100 * DAY)).toBeNull();
  });

  it("returns null when no bar exists at/before entry", () => {
    expect(extractGradingWindow(bars, -5 * DAY, 20 * DAY)).toBeNull();
  });

  it("skips weekend gaps: horizon lands on the next available bar", () => {
    const gapped = [
      { ts: 0, close: 100 },
      { ts: 1 * DAY, close: 101 },
      { ts: 4 * DAY, close: 104 }, // gap over days 2-3
    ];
    const w = extractGradingWindow(gapped, 0, 2 * DAY);
    expect(w).not.toBeNull();
    expect(w!.horizonPrice).toBe(104);
  });
});

describe("computePathStats", () => {
  it("computes worst drawdown and best gain vs entry", () => {
    const stats = computePathStats(100, [98, 105, 92, 110, 101]);
    expect(stats.maxDrawdownPct).toBeCloseTo(-8);
    expect(stats.maxGainPct).toBeCloseTo(10);
  });

  it("keeps drawdown <= 0 and gain >= 0 even on one-way moves", () => {
    const up = computePathStats(100, [101, 105, 110]);
    expect(up.maxDrawdownPct).toBe(0);
    expect(up.maxGainPct).toBeCloseTo(10);
    const down = computePathStats(100, [99, 95]);
    expect(down.maxGainPct).toBe(0);
    expect(down.maxDrawdownPct).toBeCloseTo(-5);
  });
});
