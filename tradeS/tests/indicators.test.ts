import { describe, it, expect } from "vitest";
import { sma, ema, rsi, macd, atr, bollingerBands, obv, computeSnapshot } from "@/lib/quant/indicators";
import type { Bar } from "@/lib/quant/types";

function makeBars(closes: number[], startTs = 0): Bar[] {
  return closes.map((c, i) => ({
    ts: startTs + i * 86_400_000,
    open: c,
    high: c + 1,
    low: c - 1,
    close: c,
    volume: 1_000_000 + i * 1000,
  }));
}

describe("sma", () => {
  it("computes a simple moving average with correct warm-up nulls", () => {
    const values = [1, 2, 3, 4, 5];
    const result = sma(values, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2);
    expect(result[3]).toBeCloseTo(3);
    expect(result[4]).toBeCloseTo(4);
  });
});

describe("ema", () => {
  it("seeds with sma then applies exponential smoothing", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = ema(values, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2); // seed = sma(1,2,3)
    expect(result[3]).not.toBeNull();
  });
});

describe("rsi", () => {
  it("returns 100 when there are no losses", () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1); // strictly increasing
    const result = rsi(values, 14);
    expect(result[14]).toBe(100);
  });

  it("returns null before the warm-up period", () => {
    const values = [1, 2, 3];
    const result = rsi(values, 14);
    expect(result.every((v) => v === null)).toBe(true);
  });
});

describe("macd", () => {
  it("produces macd/signal/hist lines aligned to input length", () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const { macd: macdLine, signal, hist } = macd(values);
    expect(macdLine.length).toBe(values.length);
    expect(signal.length).toBe(values.length);
    expect(hist.length).toBe(values.length);
    const lastIdx = values.length - 1;
    expect(macdLine[lastIdx]).not.toBeNull();
    expect(hist[lastIdx]).toBeCloseTo(macdLine[lastIdx]! - signal[lastIdx]!);
  });
});

describe("atr", () => {
  it("computes a positive average true range for volatile bars", () => {
    const bars = makeBars([100, 102, 98, 105, 101, 110, 108, 112, 115, 111, 120, 118, 122, 125, 121]);
    const result = atr(bars, 14);
    expect(result[13]).not.toBeNull();
    expect(result[13]!).toBeGreaterThan(0);
  });
});

describe("bollingerBands", () => {
  it("keeps upper >= mid >= lower", () => {
    const values = Array.from({ length: 30 }, (_, i) => 100 + (i % 5));
    const { upper, mid, lower } = bollingerBands(values, 20, 2);
    const i = 25;
    expect(upper[i]!).toBeGreaterThanOrEqual(mid[i]!);
    expect(mid[i]!).toBeGreaterThanOrEqual(lower[i]!);
  });
});

describe("obv", () => {
  it("accumulates volume on up days and subtracts on down days", () => {
    const bars = makeBars([100, 101, 99, 99, 102]);
    const result = obv(bars);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(bars[1].volume); // up day
    expect(result[2]).toBe(bars[1].volume - bars[2].volume); // down day
    expect(result[3]).toBe(result[2]); // flat day unchanged
  });
});

describe("computeSnapshot", () => {
  it("returns all-nulls for an empty series", () => {
    const snap = computeSnapshot([]);
    expect(snap.sma20).toBeNull();
    expect(snap.lastClose).toBeNull();
  });

  it("computes a full snapshot for a long enough series", () => {
    const closes = Array.from({ length: 260 }, (_, i) => 100 + i * 0.1 + Math.sin(i / 7) * 3);
    const bars = makeBars(closes);
    const snap = computeSnapshot(bars);
    expect(snap.sma20).not.toBeNull();
    expect(snap.sma50).not.toBeNull();
    expect(snap.sma200).not.toBeNull();
    expect(snap.rsi14).not.toBeNull();
    expect(snap.rsi14!).toBeGreaterThanOrEqual(0);
    expect(snap.rsi14!).toBeLessThanOrEqual(100);
    expect(snap.atrPct).not.toBeNull();
    expect(snap.week52High).not.toBeNull();
    expect(snap.week52Low).not.toBeNull();
    expect(snap.lastClose).toBe(closes[closes.length - 1]);
  });
});
