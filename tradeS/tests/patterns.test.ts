import { describe, it, expect } from "vitest";
import {
  detectBreakout,
  detectCrossovers,
  detectSupportResistance,
  detectPatterns,
} from "@/lib/quant/patterns";
import { rsi } from "@/lib/quant/indicators";
import type { Bar } from "@/lib/quant/types";

function makeBars(spec: Array<{ close: number; volume?: number; high?: number; low?: number }>): Bar[] {
  return spec.map((s, i) => ({
    ts: i * 86_400_000,
    open: s.close,
    high: s.high ?? s.close + 0.5,
    low: s.low ?? s.close - 0.5,
    close: s.close,
    volume: s.volume ?? 1_000_000,
  }));
}

describe("detectBreakout", () => {
  it("detects a close above the prior N-bar high on elevated volume", () => {
    const flat = Array.from({ length: 40 }, () => ({ close: 100, volume: 1_000_000 }));
    const bars = makeBars([...flat, { close: 110, high: 110.5, volume: 3_000_000 }]);
    const result = detectBreakout(bars, 20);
    expect(result).not.toBeNull();
    expect(result?.type).toBe("breakout");
  });

  it("returns null with insufficient volume confirmation", () => {
    const flat = Array.from({ length: 40 }, () => ({ close: 100, volume: 1_000_000 }));
    const bars = makeBars([...flat, { close: 110, high: 110.5, volume: 1_000_000 }]);
    expect(detectBreakout(bars, 20)).toBeNull();
  });

  it("returns null when there is not enough history", () => {
    const bars = makeBars([{ close: 100 }, { close: 101 }]);
    expect(detectBreakout(bars, 20)).toBeNull();
  });
});

describe("detectCrossovers", () => {
  it("detects a golden cross when sma50 crosses above sma200", () => {
    // A flat run keeps sma50 == sma200, then one sharp spike pulls the
    // shorter (50-bar) average up faster than the longer (200-bar) one.
    const flat = Array.from({ length: 250 }, () => ({ close: 100 }));
    const bars = makeBars([...flat, { close: 1000 }]);
    const patterns = detectCrossovers(bars);
    expect(patterns.some((p) => p.type === "golden-cross")).toBe(true);
  });

  it("returns empty for short series", () => {
    const bars = makeBars(Array.from({ length: 50 }, () => ({ close: 100 })));
    expect(detectCrossovers(bars)).toEqual([]);
  });
});

describe("detectSupportResistance", () => {
  it("finds at most one support and one resistance in the window", () => {
    const wave = Array.from({ length: 60 }, (_, i) => ({ close: 100 + Math.sin(i / 4) * 10 }));
    const bars = makeBars(wave);
    const patterns = detectSupportResistance(bars, 60, 3);
    expect(patterns.length).toBeLessThanOrEqual(2);
    expect(patterns.every((p) => p.type === "support" || p.type === "resistance")).toBe(true);
  });
});

describe("detectPatterns", () => {
  it("aggregates all pattern detectors without throwing on short data", () => {
    const bars = makeBars([{ close: 100 }, { close: 101 }, { close: 99 }]);
    const rsiArr = rsi(bars.map((b) => b.close), 14);
    expect(() => detectPatterns(bars, rsiArr)).not.toThrow();
  });
});
