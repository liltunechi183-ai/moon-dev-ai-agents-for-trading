import { describe, it, expect } from "vitest";
import {
  tradingDate,
  planEntry,
  sessionsSinceEntry,
  decideTimeExit,
  sharesFor,
  decideForSymbol,
  maxConcurrentPositions,
  toCents,
} from "@/lib/bot/primer-salto";
import { computeSignals, DEFAULT_PARAMS } from "@/lib/study/primer-salto";
import type { Bar } from "@/lib/quant/types";

/**
 * A slow 40-session slide that drives RSI to oversold, then one bar that
 * jumps back above BOTH means — the checklist's shape. Geometry verified
 * against computeSignals(), not assumed: the first test below asserts the
 * fixture really does fire, so a change to the strategy breaks the fixture
 * loudly instead of quietly making every other test vacuous.
 */
function signalBars(): Bar[] {
  const bars: Bar[] = [];
  const day = 86_400_000;
  const start = Date.UTC(2024, 0, 2, 21, 0, 0);
  let price = 100;
  for (let i = 0; i < 45; i++) {
    bars.push({ ts: start + i * day, open: price, high: price + 0.5, low: price - 0.5, close: price, volume: 1e6 });
  }
  for (let i = 0; i < 40; i++) {
    price -= 0.35;
    bars.push({ ts: start + (45 + i) * day, open: price + 0.28, high: price + 0.31, low: price - 0.4, close: price, volume: 1e6 });
  }
  const prev = bars[bars.length - 1];
  bars.push({
    ts: start + 85 * day,
    open: prev.close,
    high: prev.close + 10,
    low: prev.close - 0.4,
    close: prev.close + 9,
    volume: 3e6,
  });
  return bars;
}

describe("tradingDate", () => {
  it("uses the New York trading day, not UTC", () => {
    // 01:30 UTC on the 3rd is still the evening of the 2nd in New York.
    expect(tradingDate(Date.UTC(2024, 0, 3, 1, 30))).toBe("2024-01-02");
  });

  it("is stable across a normal afternoon close", () => {
    expect(tradingDate(Date.UTC(2024, 5, 14, 20, 0))).toBe("2024-06-14");
  });
});

describe("planEntry", () => {
  const bars = signalBars();

  it("the fixture really is a signal on the last bar", () => {
    const { long } = computeSignals(bars, DEFAULT_PARAMS);
    expect(long[long.length - 1]).toBe(true);
  });

  it("prices the stop below the signal bar's low and the target at 3R", () => {
    const plan = planEntry(bars);
    expect(plan).not.toBeNull();
    const last = bars[bars.length - 1];
    expect(plan!.stopPrice).toBeLessThan(last.low);
    expect(plan!.price).toBe(last.close);
    const risk = plan!.price - plan!.stopPrice;
    expect(plan!.targetPrice).toBeCloseTo(plan!.price + 3 * risk, 6);
    expect(plan!.riskPerShare).toBeCloseTo(risk, 6);
  });

  it("ignores a signal that is not on the last bar — it is no longer actionable", () => {
    const stale = [
      ...bars,
      // A quiet day after the jump: no new signal.
      { ts: bars[bars.length - 1].ts + 86_400_000, open: 95, high: 95.3, low: 94.7, close: 95, volume: 1e6 },
    ];
    expect(planEntry(stale)).toBeNull();
  });

  it("returns null on empty input rather than throwing", () => {
    expect(planEntry([])).toBeNull();
  });
});

describe("sessionsSinceEntry", () => {
  const dates = ["2024-03-01", "2024-03-04", "2024-03-05", "2024-03-06"];

  it("counts trading sessions, so a weekend gap is not two days", () => {
    // Fri 1st → Mon 4th is ONE session, though three calendar days passed.
    expect(sessionsSinceEntry(dates, "2024-03-01")).toBe(3);
    expect(sessionsSinceEntry(dates, "2024-03-04")).toBe(2);
  });

  it("is zero on the entry bar itself", () => {
    expect(sessionsSinceEntry(dates, "2024-03-06")).toBe(0);
  });

  it("returns null when the entry date is not in the data", () => {
    expect(sessionsSinceEntry(dates, "2024-02-01")).toBeNull();
  });
});

describe("decideTimeExit", () => {
  const dates = Array.from({ length: 25 }, (_, i) => `2024-04-${String(i + 1).padStart(2, "0")}`);

  it("closes once the session limit is reached", () => {
    const d = decideTimeExit({ symbol: "AAPL", entryDate: "2024-04-01", maxBars: 20 }, dates);
    expect(d.close).toBe(true);
    if (d.close) expect(d.sessionsHeld).toBe(24);
  });

  it("holds while there is time left, and says how much", () => {
    const d = decideTimeExit({ symbol: "AAPL", entryDate: "2024-04-20", maxBars: 20 }, dates);
    expect(d.close).toBe(false);
    expect(d.reason).toContain("of 20 sessions");
  });

  it("fires exactly at the limit, not one session late", () => {
    const entry = dates[dates.length - 1 - 20];
    expect(decideTimeExit({ symbol: "X", entryDate: entry, maxBars: 20 }, dates).close).toBe(true);
    const oneEarlier = dates[dates.length - 1 - 19];
    expect(decideTimeExit({ symbol: "X", entryDate: oneEarlier, maxBars: 20 }, dates).close).toBe(false);
  });

  it("never closes when the time exit is switched off", () => {
    expect(decideTimeExit({ symbol: "X", entryDate: dates[0], maxBars: 0 }, dates).close).toBe(false);
  });

  it("holds rather than closing blindly when the entry date is missing", () => {
    const d = decideTimeExit({ symbol: "X", entryDate: "1999-01-01", maxBars: 20 }, dates);
    expect(d.close).toBe(false);
    expect(d.reason).toContain("not found");
  });
});

describe("sharesFor", () => {
  it("floors to whole shares", () => {
    expect(sharesFor(400, 97.3)).toBe(4);
  });
  it("returns zero when one share is unaffordable", () => {
    expect(sharesFor(400, 900)).toBe(0);
  });
  it("does not divide by a nonsense price", () => {
    expect(sharesFor(400, 0)).toBe(0);
  });
});

describe("maxConcurrentPositions", () => {
  it("derives the slot count from the money set aside", () => {
    expect(maxConcurrentPositions(2400, 400)).toBe(6);
  });
  it("always allows at least one, so a tight budget still trades", () => {
    expect(maxConcurrentPositions(300, 400)).toBe(1);
  });
  it("allows none when the trade size is nonsense", () => {
    expect(maxConcurrentPositions(2400, 0)).toBe(0);
  });
});

describe("decideForSymbol", () => {
  const bars = signalBars();
  const base = {
    bars,
    hasPosition: false,
    openStrategyPositions: 0,
    maxConcurrent: 6,
    notionalUsd: 400,
  };

  it("buys on a fresh signal with room to hold it", () => {
    const d = decideForSymbol(base);
    expect(d.act).toBe("buy");
    if (d.act === "buy") {
      expect(d.shares).toBeGreaterThan(0);
      expect(d.plan.targetPrice).toBeGreaterThan(d.plan.price);
    }
  });

  it("never adds to a symbol it already holds", () => {
    const d = decideForSymbol({ ...base, hasPosition: true });
    expect(d).toMatchObject({ act: "skip", why: "already-holding" });
  });

  it("stops at the concurrent-position cap", () => {
    const d = decideForSymbol({ ...base, openStrategyPositions: 6 });
    expect(d).toMatchObject({ act: "skip", why: "position-cap" });
  });

  it("skips a symbol without enough history to compute the indicators", () => {
    const d = decideForSymbol({ ...base, bars: bars.slice(-10) });
    expect(d).toMatchObject({ act: "skip", why: "not-enough-history" });
  });

  it("skips when the trade size cannot buy a single share", () => {
    const d = decideForSymbol({ ...base, notionalUsd: 5 });
    expect(d).toMatchObject({ act: "skip", why: "too-small" });
  });

  it("skips quietly when there is simply no signal", () => {
    const quiet: Bar[] = Array.from({ length: 120 }, (_, i) => ({
      ts: Date.UTC(2024, 0, 2) + i * 86_400_000,
      open: 100, high: 100.4, low: 99.6, close: 100, volume: 1e6,
    }));
    expect(decideForSymbol({ ...base, bars: quiet })).toMatchObject({
      act: "skip",
      why: "no-signal",
    });
  });
});

describe("toCents", () => {
  it("rounds to the precision a broker will accept", () => {
    expect(toCents(12.3456)).toBe(12.35);
    expect(toCents(99.999)).toBe(100);
  });
});
