import { describe, it, expect } from "vitest";
import { computeAccuracy, type GradedRow } from "@/lib/research/accuracy";
import type { IndicatorSnapshot } from "@/lib/quant/types";

function row(overrides: Partial<GradedRow>): GradedRow {
  return {
    outlook: "bullish",
    confidence: 7,
    algoVersion: 2,
    regime: "bull-calm",
    returnPct: 5,
    directionCorrect: true,
    neutralBandPct: 3,
    benchmarkReturnPct: 2,
    quantSnapshot: {
      indicators: { lastClose: 110, sma50: 100 } as IndicatorSnapshot,
    },
    ...overrides,
  };
}

describe("computeAccuracy", () => {
  it("returns empty stats for no rows", () => {
    const stats = computeAccuracy([]);
    expect(stats.graded).toBe(0);
    expect(stats.winRate).toBeNull();
    expect(stats.baselines.alwaysBullishWinRate).toBeNull();
  });

  it("computes win rate, avg return, and excess vs SPY", () => {
    const stats = computeAccuracy([
      row({ returnPct: 10, directionCorrect: true, benchmarkReturnPct: 4 }),
      row({ returnPct: -2, directionCorrect: false, benchmarkReturnPct: 1 }),
    ]);
    expect(stats.graded).toBe(2);
    expect(stats.winRate).toBeCloseTo(0.5);
    expect(stats.avgReturnPct).toBeCloseTo(4);
    expect(stats.avgExcessVsSpyPct).toBeCloseTo(((10 - 4) + (-2 - 1)) / 2);
  });

  it("always-bullish baseline is the share of positive-return windows", () => {
    const stats = computeAccuracy([
      row({ returnPct: 3 }),
      row({ returnPct: -1 }),
      row({ returnPct: 7 }),
      row({ returnPct: -4 }),
    ]);
    expect(stats.baselines.alwaysBullishWinRate).toBeCloseTo(0.5);
  });

  it("momentum baseline calls bullish above sma50, bearish below, graded on the same window", () => {
    const stats = computeAccuracy([
      // Above sma50 → momentum says bullish; return positive → momentum right.
      row({
        returnPct: 5,
        quantSnapshot: { indicators: { lastClose: 110, sma50: 100 } as IndicatorSnapshot },
      }),
      // Below sma50 → momentum says bearish; return positive → momentum wrong.
      row({
        returnPct: 5,
        quantSnapshot: { indicators: { lastClose: 90, sma50: 100 } as IndicatorSnapshot },
      }),
    ]);
    expect(stats.baselines.momentumWinRate).toBeCloseTo(0.5);
  });

  it("excludes rows without snapshots from the momentum baseline", () => {
    const stats = computeAccuracy([row({ quantSnapshot: null })]);
    expect(stats.baselines.momentumWinRate).toBeNull();
  });

  it("buckets by outlook, confidence, version, and regime", () => {
    const stats = computeAccuracy([
      row({ outlook: "bullish", confidence: 8, algoVersion: 2, regime: "bull-calm" }),
      row({ outlook: "bearish", confidence: 3, algoVersion: 1, regime: null, directionCorrect: false }),
    ]);
    expect(stats.byOutlook.map((b) => b.label).sort()).toEqual(["bearish", "bullish"]);
    expect(stats.byConfidence.map((b) => b.label).sort()).toEqual(["high", "low"]);
    expect(stats.byVersion.map((b) => b.label).sort()).toEqual(["v1", "v2"]);
    expect(stats.byRegime).toHaveLength(1); // null regimes excluded
  });
});
