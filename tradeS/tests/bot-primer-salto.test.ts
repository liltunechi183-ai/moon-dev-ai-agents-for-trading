import { describe, it, expect } from "vitest";
import {
  tradingDate,
  planEntry,
  sessionsSinceEntry,
  decideTimeExit,
  sharesFor,
  decideForSymbol,
  maxConcurrentPositions,
  scanOrder,
  riskBasedShares,
  marketContext,
  pctOffHigh,
  toCents,
  scanSummary,
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

describe("scanOrder", () => {
  const universe = ["AAPL", "ABT", "MSFT", "XOM", "VZ", "JPM", "KO", "PG"];

  it("keeps every symbol exactly once — a shuffle, not a filter", () => {
    const out = scanOrder(universe, "2024-03-01");
    expect(out).toHaveLength(universe.length);
    expect([...out].sort()).toEqual([...universe].sort());
  });

  it("is reproducible for a given day, so re-running a scan agrees with itself", () => {
    expect(scanOrder(universe, "2024-03-01")).toEqual(scanOrder(universe, "2024-03-01"));
  });

  it("changes from day to day", () => {
    expect(scanOrder(universe, "2024-03-01")).not.toEqual(scanOrder(universe, "2024-03-04"));
  });

  it("regression: the last symbol gets picked as often as the first", () => {
    // In list order XOM would never be reached when slots fill early. Over
    // many days each symbol should land in the first two slots at a broadly
    // similar rate — the point is that none is structurally shut out.
    const firstTwo = new Map<string, number>(universe.map((s) => [s, 0]));
    for (let day = 1; day <= 600; day++) {
      const date = `2024-${String((day % 12) + 1).padStart(2, "0")}-${String((day % 28) + 1).padStart(2, "0")}-${day}`;
      for (const s of scanOrder(universe, date).slice(0, 2)) {
        firstTwo.set(s, (firstTwo.get(s) ?? 0) + 1);
      }
    }
    const counts = [...firstTwo.values()];
    expect(Math.min(...counts)).toBeGreaterThan(0);
    // No symbol should take more than double the share of the least-picked.
    expect(Math.max(...counts) / Math.min(...counts)).toBeLessThan(2);
  });

  it("handles an empty universe without throwing", () => {
    expect(scanOrder([], "2024-03-01")).toEqual([]);
  });
});

describe("riskBasedShares", () => {
  const base = { equity: 3000, riskPct: 0.005, entryPrice: 100, stopPrice: 96, maxPositionUsd: 600 };

  it("puts the configured fraction of equity behind the stop", () => {
    // 0.5% of $3,000 is $15; the stop is $4 away, so 3 shares risk $12.
    const s = riskBasedShares(base);
    expect(s.shares).toBe(3);
    expect(s.riskUsd).toBeCloseTo(12, 6);
    expect(s.boundBy).toBe("risk");
  });

  it("equalises risk across stops of different width — the point of the exercise", () => {
    // A 10%-stop name and a 4%-stop name should risk about the same amount,
    // which fixed dollars would not do.
    const tight = riskBasedShares({ ...base, stopPrice: 96, maxPositionUsd: 100_000 });
    const wide = riskBasedShares({ ...base, stopPrice: 90, maxPositionUsd: 100_000 });
    expect(Math.abs(tight.riskUsd - wide.riskUsd)).toBeLessThan(base.entryPrice * 0.1);
    expect(wide.notionalUsd).toBeLessThan(tight.notionalUsd);
  });

  it("regression: the cap stops the risk maths asking for half the account", () => {
    // 2% of $3,000 behind a 4% stop wants $1,500 — half the account in one
    // name. The cap must win.
    const s = riskBasedShares({ ...base, riskPct: 0.02, maxPositionUsd: 600 });
    expect(s.notionalUsd).toBeLessThanOrEqual(600);
    expect(s.boundBy).toBe("position-cap");
  });

  it("reports the risk actually taken, which is lower when the cap binds", () => {
    const s = riskBasedShares({ ...base, riskPct: 0.02, maxPositionUsd: 600 });
    // 6 shares x $4 = $24, well under the $60 the 2% asked for.
    expect(s.riskUsd).toBeLessThan(3000 * 0.02);
  });

  it("buys nothing rather than guessing when the stop is not below the entry", () => {
    expect(riskBasedShares({ ...base, stopPrice: 100 }).shares).toBe(0);
    expect(riskBasedShares({ ...base, stopPrice: 105 }).shares).toBe(0);
  });

  it("buys nothing on nonsense inputs instead of dividing by zero", () => {
    expect(riskBasedShares({ ...base, equity: 0 }).shares).toBe(0);
    expect(riskBasedShares({ ...base, riskPct: 0 }).shares).toBe(0);
    expect(riskBasedShares({ ...base, entryPrice: 0 }).shares).toBe(0);
  });

  it("never returns fractional shares", () => {
    const s = riskBasedShares({ ...base, entryPrice: 97.37, stopPrice: 93.11 });
    expect(Number.isInteger(s.shares)).toBe(true);
  });
});

describe("decideForSymbol — sizing method", () => {
  const bars = signalBars();
  const base = {
    bars,
    hasPosition: false,
    openStrategyPositions: 0,
    maxConcurrent: 6,
    notionalUsd: 400,
  };

  it("keeps the fixed-dollar path when no risk percentage is set", () => {
    const d = decideForSymbol(base);
    expect(d.act).toBe("buy");
    if (d.act === "buy") expect(d.sizing.boundBy).toBe("none");
  });

  it("switches to risk sizing once a risk percentage is given", () => {
    const d = decideForSymbol({ ...base, equity: 3000, riskPct: 0.005, maxPositionUsd: 600 });
    expect(d.act).toBe("buy");
    if (d.act === "buy") {
      expect(["risk", "position-cap"]).toContain(d.sizing.boundBy);
      expect(d.sizing.notionalUsd).toBeLessThanOrEqual(600);
    }
  });

  it("still refuses a position it cannot afford one share of", () => {
    const d = decideForSymbol({ ...base, equity: 3000, riskPct: 0.005, maxPositionUsd: 5 });
    expect(d).toMatchObject({ act: "skip", why: "too-small" });
  });
});

describe("marketContext", () => {
  const rising = Array.from({ length: 260 }, (_, i) => 100 + i * 0.5);

  it("reports SPY above both means in an uptrend", () => {
    expect(marketContext(rising)).toEqual({ spyAboveMa200: true, spyAboveMa20: true });
  });

  it("reports below both after a fall", () => {
    const c = marketContext([...rising, ...Array.from({ length: 30 }, () => 50)]);
    expect(c).toEqual({ spyAboveMa200: false, spyAboveMa20: false });
  });

  it("separates the two horizons — a dip breaks the 20 before the 200", () => {
    // Down enough to lose the 20-day, not enough to lose the 200-day.
    const dip = [...rising, ...Array.from({ length: 5 }, () => 215)];
    const c = marketContext(dip);
    expect(c.spyAboveMa20).toBe(false);
    expect(c.spyAboveMa200).toBe(true);
  });

  it("says null rather than guessing without enough history", () => {
    expect(marketContext([100, 101])).toEqual({ spyAboveMa200: null, spyAboveMa20: null });
    expect(marketContext([])).toEqual({ spyAboveMa200: null, spyAboveMa20: null });
  });
});

describe("pctOffHigh", () => {
  const bar = (close: number, high = close): Bar => ({
    ts: 0, open: close, high, low: close, close, volume: 1e6,
  });

  it("measures the fall from the highest high in the window", () => {
    // High of 100, now at 80: 20% off.
    expect(pctOffHigh([bar(100), bar(90), bar(80)])).toBeCloseTo(-0.2, 6);
  });

  it("is zero at a fresh high", () => {
    expect(pctOffHigh([bar(80), bar(90), bar(100)])).toBeCloseTo(0, 6);
  });

  it("only looks back over the window given", () => {
    const old = Array.from({ length: 300 }, () => bar(500));
    const recent = Array.from({ length: 252 }, () => bar(100));
    // The 500s are outside a 252-bar window, so this is not 80% off.
    expect(pctOffHigh([...old, ...recent], 252)).toBeCloseTo(0, 6);
  });

  it("returns null with nothing to measure", () => {
    expect(pctOffHigh([])).toBeNull();
  });
});

describe("scanSummary", () => {
  const tally = {
    universe: 69,
    scanned: 69,
    fetchFailures: 0,
    bought: 0,
    openCount: 0,
    maxConcurrent: 4,
  };

  it("says the scan happened even when nothing was bought", () => {
    // The whole point: a silent day must leave a record. At 2.4 entries a
    // month this is by far the most common outcome.
    const line = scanSummary(tally);
    expect(line).toContain("69 of 69 symbol(s) read");
    expect(line).toContain("0 new position(s)");
    expect(line).toContain("0/4 slots used");
    expect(line).not.toContain("failure");
    expect(line).not.toContain("stopped early");
  });

  it("distinguishes a quiet day from a data outage", () => {
    const quiet = scanSummary(tally);
    const outage = scanSummary({ ...tally, scanned: 0, fetchFailures: 69 });
    // Both bought nothing. They must not read the same.
    expect(outage).not.toEqual(quiet);
    expect(outage).toContain("0 of 69 symbol(s) read");
    expect(outage).toContain("69 fetch failure(s)");
  });

  it("flags a universe left half-examined because the slots filled", () => {
    const line = scanSummary({ ...tally, scanned: 12, bought: 4, openCount: 4 });
    expect(line).toContain("12 of 69 symbol(s) read");
    expect(line).toContain("stopped early: all slots full");
  });

  it("does not cry 'stopped early' when failures account for the shortfall", () => {
    // 60 read + 9 failed = all 69 attempted. The loop ran to the end.
    const line = scanSummary({ ...tally, scanned: 60, fetchFailures: 9 });
    expect(line).toContain("9 fetch failure(s)");
    expect(line).not.toContain("stopped early");
  });
});
