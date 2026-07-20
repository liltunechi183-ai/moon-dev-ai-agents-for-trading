import { describe, it, expect } from "vitest";
import {
  earnedConfidence,
  capConfidence,
  confidenceBucket,
  segmentStatsFrom,
  MIN_SEGMENT_SAMPLES,
} from "@/lib/research/calibration";

describe("earnedConfidence", () => {
  it("maps the anchor win rates exactly: 50%→0, 75%→5, 100%→10", () => {
    expect(earnedConfidence(0.5)).toBe(0);
    expect(earnedConfidence(0.75)).toBe(5);
    expect(earnedConfidence(1)).toBe(10);
  });

  it("clamps below-coin-flip win rates to 0", () => {
    expect(earnedConfidence(0.3)).toBe(0);
  });
});

describe("confidenceBucket", () => {
  it("buckets 0-3 low, 4-6 mid, 7-10 high", () => {
    expect(confidenceBucket(0)).toBe("low");
    expect(confidenceBucket(3)).toBe("low");
    expect(confidenceBucket(4)).toBe("mid");
    expect(confidenceBucket(6)).toBe("mid");
    expect(confidenceBucket(7)).toBe("high");
    expect(confidenceBucket(10)).toBe("high");
  });
});

describe("capConfidence", () => {
  it("caps a high self-report at what the segment earned", () => {
    // 60% win rate earns confidence 2; a raw 8 must be capped to 2.
    const { effective, capped } = capConfidence("bullish", 8, 0.6, 20);
    expect(capped).toBe(true);
    expect(effective).toBe(2);
  });

  it("never raises a self-report", () => {
    // 100% win rate earns 10, but raw 4 stays 4.
    const { effective, capped } = capConfidence("bullish", 4, 1, 20);
    expect(capped).toBe(false);
    expect(effective).toBe(4);
  });

  it("passes neutral through untouched", () => {
    const { effective, capped } = capConfidence("neutral", 9, 0.5, 100);
    expect(capped).toBe(false);
    expect(effective).toBe(9);
  });

  it("passes thin segments through untouched", () => {
    const { effective, capped } = capConfidence("bearish", 9, 0.5, MIN_SEGMENT_SAMPLES - 1);
    expect(capped).toBe(false);
    expect(effective).toBe(9);
  });
});

describe("segmentStatsFrom", () => {
  const calls = [
    { outlook: "bullish" as const, confidence: 8, directionCorrect: true },
    { outlook: "bullish" as const, confidence: 7, directionCorrect: false },
    { outlook: "bullish" as const, confidence: 9, directionCorrect: true },
    { outlook: "bullish" as const, confidence: 4, directionCorrect: false }, // mid bucket
    { outlook: "bearish" as const, confidence: 8, directionCorrect: true }, // other outlook
  ];

  it("aggregates only matching outlook + confidence bucket", () => {
    const stats = segmentStatsFrom(calls, "bullish", 8);
    expect(stats.samples).toBe(3);
    expect(stats.winRate).toBeCloseTo(2 / 3);
  });

  it("returns null win rate for an empty segment", () => {
    const stats = segmentStatsFrom(calls, "neutral", 5);
    expect(stats.samples).toBe(0);
    expect(stats.winRate).toBeNull();
  });
});
