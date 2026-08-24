import { describe, it, expect } from "vitest";
import {
  DEFAULT_PARAMS,
  computeSignals,
  simulate,
  summarize,
  tradesInWindow,
  type PrimerSaltoParams,
  type Trade,
  type Stats,
  stayedProfitable,
  averageR,
} from "@/lib/study/primer-salto";
import type { Bar } from "@/lib/quant/types";

const DAY = 86_400_000;

function bar(i: number, o: number, h: number, l: number, c: number): Bar {
  return { ts: Date.UTC(2020, 0, 1) + i * DAY, open: o, high: h, low: l, close: c, volume: 1_000_000 };
}

/**
 * A series engineered to satisfy the whole checklist on the last bar:
 * a long slide well below both means (driving RSI under 35 and the fast MA
 * down), then one bar that gaps up through both means, takes out the prior
 * high and closes strong.
 */
function checklistSeries(): Bar[] {
  const bars: Bar[] = [];
  // 60 flat bars to seed the 40-period mean and the RSI.
  for (let i = 0; i < 60; i++) bars.push(bar(i, 100, 100.5, 99.5, 100));
  // A slow, steady slide: price stays under the falling fast mean and RSI
  // sinks into oversold, while the means drift down close to price — so the
  // jump that clears them is an ordinary-sized bar, not a 50% gap.
  let price = 100;
  for (let i = 60; i < 120; i++) {
    const open = price;
    price -= 0.15;
    bars.push(bar(i, open, open + 0.1, price - 0.05, price));
  }
  // The jump: clears both means and the prior high, closing near its top.
  const prev = bars[bars.length - 1];
  bars.push(bar(120, prev.close, prev.close + 4.0, prev.close - 0.2, prev.close + 3.6));
  return bars;
}

/** Append a bar after the signal, using the next index. */
function after(bars: Bar[], o: number, h: number, l: number, c: number): Bar {
  return bar(bars.length, o, h, l, c);
}

describe("computeSignals — the five rules together", () => {
  it("fires on a bar that satisfies the whole checklist", () => {
    const bars = checklistSeries();
    const { long } = computeSignals(bars, DEFAULT_PARAMS);
    expect(long[bars.length - 1]).toBe(true);
  });

  it("fires nowhere on a series that only drifts sideways", () => {
    const flat: Bar[] = [];
    for (let i = 0; i < 120; i++) flat.push(bar(i, 100, 100.4, 99.6, 100));
    const { long } = computeSignals(flat, DEFAULT_PARAMS);
    expect(long.some(Boolean)).toBe(false);
  });
});

describe("computeSignals — each rule can veto on its own", () => {
  const bars = checklistSeries();
  const last = bars.length - 1;

  it("rule 3: breaking only the fast mean is not enough", () => {
    // Close between the two means: above MA20, below MA40.
    const modified = [...bars];
    const { maFast, maSlow } = computeSignals(bars, DEFAULT_PARAMS);
    const between = (maFast[last]! + maSlow[last]!) / 2;
    modified[last] = bar(last, bars[last].open, between + 0.2, bars[last].low, between);
    expect(computeSignals(modified, DEFAULT_PARAMS).long[last]).toBe(false);
  });

  it("rule 4: a jump that closes below its open does not count", () => {
    const modified = [...bars];
    const b = bars[last];
    modified[last] = bar(last, b.close, b.close + 0.2, b.low, b.close - 1); // closes under the open
    expect(computeSignals(modified, DEFAULT_PARAMS).long[last]).toBe(false);
  });

  it("rule 2: turning exhaustion off cannot remove a signal, only add", () => {
    const strict = computeSignals(bars, DEFAULT_PARAMS).long.filter(Boolean).length;
    const loose = computeSignals(bars, { ...DEFAULT_PARAMS, useExhaust: false }).long.filter(
      Boolean,
    ).length;
    expect(loose).toBeGreaterThanOrEqual(strict);
  });

  it("rule 5: the news proxy rejects an abnormally wide jump bar", () => {
    const params: PrimerSaltoParams = { ...DEFAULT_PARAMS, useNewsFilter: true, newsAtrMult: 0.5 };
    expect(computeSignals(bars, params).long[last]).toBe(false);
  });
});

describe("simulate — exits", () => {
  const params = { ...DEFAULT_PARAMS, commissionPct: 0 };

  it("takes the target when price reaches it", () => {
    const bars = checklistSeries();
    const trades = simulate([...bars, after(bars, 100, 200, 99, 199)], params);
    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe("target");
    expect(trades[0].exitPrice).toBeCloseTo(trades[0].targetPrice, 6);
    expect(trades[0].returnPct).toBeGreaterThan(0);
  });

  it("takes the stop when price breaks it", () => {
    const bars = checklistSeries();
    const trades = simulate([...bars, after(bars, 95, 95.5, 1, 2)], params);
    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe("stop");
    expect(trades[0].returnPct).toBeLessThan(0);
  });

  it("assumes the stop when one bar spans both levels — the pessimistic read", () => {
    const bars = checklistSeries();
    const trades = simulate([...bars, after(bars, 95, 300, 1, 150)], params);
    expect(trades[0].exitReason).toBe("stop");
  });

  it("gives up at the time limit when neither level is touched", () => {
    const bars = checklistSeries();
    const drifting = [...bars];
    const flat = bars[bars.length - 1].close;
    for (let k = 0; k < 25; k++) drifting.push(after(drifting, flat, flat + 0.05, flat - 0.05, flat));
    const trades = simulate(drifting, params);
    expect(trades[0].exitReason).toBe("time");
    expect(trades[0].exitIndex! - trades[0].entryIndex).toBe(params.maxBars);
  });

  it("drops a position still open at the end of the data rather than marking it to market", () => {
    const bars = checklistSeries(); // signal on the very last bar, no bars after
    expect(simulate(bars, params)).toHaveLength(0);
  });

  it("charges commission on both sides", () => {
    const base = checklistSeries();
    const bars = [...base, after(base, 100, 200, 99, 199)];
    const free = simulate(bars, { ...DEFAULT_PARAMS, commissionPct: 0 })[0];
    const costly = simulate(bars, { ...DEFAULT_PARAMS, commissionPct: 0.001 })[0];
    expect(free.returnPct - costly.returnPct).toBeCloseTo(0.002, 9);
  });
});

describe("summarize", () => {
  const t = (returnPct: number) => ({
    entryIndex: 0,
    entryTs: 0,
    entryPrice: 1,
    stopPrice: 0.9,
    targetPrice: 1.3,
    exitIndex: 1,
    exitTs: 0,
    exitPrice: 1,
    exitReason: "target" as const,
    returnPct,
  });

  it("computes win rate, profit factor and the average trade", () => {
    const s = summarize([t(0.1), t(0.2), t(-0.1)], 1);
    expect(s.trades).toBe(3);
    expect(s.winRate).toBeCloseTo(2 / 3, 6);
    expect(s.profitFactor).toBeCloseTo(3, 6); // 0.3 won / 0.1 lost
    expect(s.avgReturnPct).toBeCloseTo(0.2 / 3, 6);
  });

  it("compounds the equity curve and measures the worst drawdown", () => {
    const s = summarize([t(0.5), t(-0.5), t(0.5)], 1);
    expect(s.totalReturnPct).toBeCloseTo(1.5 * 0.5 * 1.5 - 1, 6);
    expect(s.maxDrawdownPct).toBeCloseTo(0.5, 6);
  });

  it("reports profit factor as null when nothing was lost, rather than infinity", () => {
    expect(summarize([t(0.1), t(0.2)], 1).profitFactor).toBeNull();
  });

  it("handles an empty record without inventing numbers", () => {
    const s = summarize([], 5);
    expect(s.trades).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.profitFactor).toBeNull();
    expect(s.tradesPerYear).toBe(0);
  });

  it("annualizes the trade count", () => {
    expect(summarize([t(0.1), t(0.1), t(0.1), t(0.1)], 2).tradesPerYear).toBe(2);
  });
});

describe("tradesInWindow", () => {
  const at = (ts: number): Trade => ({
    entryIndex: 0,
    entryTs: ts,
    entryPrice: 1,
    stopPrice: 0.9,
    targetPrice: 1.3,
    exitIndex: 1,
    exitTs: ts,
    exitPrice: 1.1,
    exitReason: "target",
    returnPct: 0.1,
  });

  it("keeps entries inside the half-open window", () => {
    const kept = tradesInWindow([at(10), at(20), at(30)], 10, 30);
    expect(kept.map((t) => t.entryTs)).toEqual([10, 20]);
  });

  it("returns nothing when the window is empty", () => {
    expect(tradesInWindow([at(10)], 100, 200)).toEqual([]);
  });
});

describe("stayedProfitable", () => {
  const stats = (trades: number, avgReturnPct: number | null, profitFactor: number | null) =>
    ({
      trades,
      wins: 0,
      winRate: null,
      profitFactor,
      avgReturnPct,
      totalReturnPct: null,
      tradesPerYear: null,
      maxDrawdownPct: null,
    }) as Stats;

  it("regression: a flawless record counts as profitable even though its PF is undefined", () => {
    // Nothing was lost, so profit factor divides by zero and comes back null.
    // Reading that as zero marked perfect symbols as failures.
    expect(stayedProfitable(stats(1, 0.1155, null))).toBe(true);
  });

  it("agrees with profit factor wherever profit factor is defined", () => {
    expect(stayedProfitable(stats(5, 0.02, 1.8))).toBe(true);
    expect(stayedProfitable(stats(5, -0.01, 0.4))).toBe(false);
  });

  it("a symbol with no trades did not stay profitable — it said nothing", () => {
    expect(stayedProfitable(stats(0, null, null))).toBe(false);
  });
});

describe("averageR", () => {
  const trade = (entryPrice: number, stopPrice: number, returnPct: number): Trade =>
    ({
      entryIndex: 0, entryTs: 0, entryPrice, stopPrice, targetPrice: 0,
      exitIndex: 1, exitTs: 0, exitPrice: 0, exitReason: "target", returnPct,
    }) as Trade;

  it("scores a trade that reached its 3R target near +3, whatever the stop's width", () => {
    // Tight stop: 2% risk, +6% move. Wide stop: 8% risk, +24% move. Same R.
    const tight = averageR([trade(100, 98, 0.06)]);
    const wide = averageR([trade(100, 92, 0.24)]);
    expect(tight).toBeCloseTo(3, 6);
    expect(wide).toBeCloseTo(3, 6);
  });

  it("scores a stop-out near −1", () => {
    expect(averageR([trade(100, 95, -0.05)])).toBeCloseTo(-1, 6);
  });

  it("separates the two sizing yardsticks: same R, very different percent", () => {
    // This is the whole point of tracking both — a wide stop wins more
    // percent per trade while covering the same multiple of its own risk.
    const tight = [trade(100, 98, 0.06)];
    const wide = [trade(100, 92, 0.24)];
    expect(averageR(tight)).toBeCloseTo(averageR(wide)!, 6);
    expect(summarize(wide, 1).avgReturnPct!).toBeGreaterThan(summarize(tight, 1).avgReturnPct!);
  });

  it("ignores trades with no defined risk rather than scoring them zero", () => {
    expect(averageR([trade(100, 100, 0.05), trade(100, 95, -0.05)])).toBeCloseTo(-1, 6);
    expect(averageR([trade(100, 100, 0.05)])).toBeNull();
  });

  it("is null with no trades at all", () => {
    expect(averageR([])).toBeNull();
    expect(summarize([], 1).avgR).toBeNull();
  });
});
