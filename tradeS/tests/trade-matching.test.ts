import { describe, it, expect } from "vitest";
import { matchRoundTrips, computeRuleStats, type FilledOrder, type OrderAttribution } from "@/lib/bot/trade-matching";

let ts = 1000;
function fill(overrides: Partial<FilledOrder>): FilledOrder {
  return {
    alpacaOrderId: `o-${ts}`,
    parentOrderId: null,
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 10,
    filledAvgPrice: 100,
    filledAt: ts++,
    ...overrides,
  };
}

function attr(entries: Array<[string, OrderAttribution]>): Map<string, OrderAttribution> {
  return new Map(entries);
}

describe("matchRoundTrips", () => {
  it("pairs a bracket stop-loss leg with its own parent and classifies the exit", () => {
    const entry = fill({ alpacaOrderId: "parent", filledAvgPrice: 100 });
    const stopLeg = fill({
      alpacaOrderId: "leg-stop",
      parentOrderId: "parent",
      side: "sell",
      type: "stop",
      filledAvgPrice: 95,
    });
    const trips = matchRoundTrips([entry, stopLeg], attr([["parent", { ruleId: 1, ruleVersion: 2 }]]));
    expect(trips).toHaveLength(1);
    expect(trips[0].exitKind).toBe("stop-loss");
    expect(trips[0].ruleId).toBe(1);
    expect(trips[0].ruleVersion).toBe(2);
    expect(trips[0].pnlUsd).toBeCloseTo(-50);
    expect(trips[0].pnlPct).toBeCloseTo(-5);
  });

  it("classifies a limit leg as take-profit", () => {
    const entry = fill({ alpacaOrderId: "p2", filledAvgPrice: 100 });
    const tpLeg = fill({
      alpacaOrderId: "leg-tp",
      parentOrderId: "p2",
      side: "sell",
      type: "limit",
      filledAvgPrice: 110,
    });
    const trips = matchRoundTrips([entry, tpLeg], attr([]));
    expect(trips[0].exitKind).toBe("take-profit");
    expect(trips[0].pnlUsd).toBeCloseTo(100);
  });

  it("drains sell-rule market sells FIFO across multiple open lots", () => {
    const lot1 = fill({ alpacaOrderId: "b1", filledAvgPrice: 100, qty: 10 });
    const lot2 = fill({ alpacaOrderId: "b2", filledAvgPrice: 110, qty: 10 });
    const sell = fill({ alpacaOrderId: "s1", side: "sell", type: "market", qty: 15, filledAvgPrice: 120 });
    const trips = matchRoundTrips(
      [lot1, lot2, sell],
      attr([
        ["b1", { ruleId: 1, ruleVersion: 1 }],
        ["b2", { ruleId: 2, ruleVersion: 1 }],
        ["s1", { ruleId: 9, ruleVersion: 1 }],
      ]),
    );
    expect(trips).toHaveLength(2);
    // FIFO: first lot fully closed, second partially.
    expect(trips[0].entryOrderId).toBe("b1");
    expect(trips[0].qty).toBe(10);
    expect(trips[1].entryOrderId).toBe("b2");
    expect(trips[1].qty).toBe(5);
    expect(trips[0].exitKind).toBe("sell-rule");
    expect(trips[0].exitRuleId).toBe(9); // sell rule attribution
    expect(trips[0].ruleId).toBe(1); // entry rule attribution preserved
  });

  it("keeps per-symbol queues separate", () => {
    const a = fill({ alpacaOrderId: "a-buy", symbol: "AAPL", filledAvgPrice: 100 });
    const t = fill({ alpacaOrderId: "t-buy", symbol: "TSLA", filledAvgPrice: 200 });
    const sellT = fill({ alpacaOrderId: "t-sell", symbol: "TSLA", side: "sell", type: "market", filledAvgPrice: 210 });
    const trips = matchRoundTrips([a, t, sellT], attr([]));
    expect(trips).toHaveLength(1);
    expect(trips[0].symbol).toBe("TSLA");
  });

  it("returns nothing for an entry that has not exited", () => {
    const trips = matchRoundTrips([fill({})], attr([]));
    expect(trips).toHaveLength(0);
  });
});

describe("computeRuleStats", () => {
  it("aggregates per rule+version with win rate and exit-kind breakdown", () => {
    const entry1 = fill({ alpacaOrderId: "e1", filledAvgPrice: 100 });
    const exit1 = fill({ alpacaOrderId: "x1", parentOrderId: "e1", side: "sell", type: "limit", filledAvgPrice: 110 });
    const entry2 = fill({ alpacaOrderId: "e2", filledAvgPrice: 100 });
    const exit2 = fill({ alpacaOrderId: "x2", parentOrderId: "e2", side: "sell", type: "stop", filledAvgPrice: 95 });
    const trips = matchRoundTrips(
      [entry1, exit1, entry2, exit2],
      attr([
        ["e1", { ruleId: 1, ruleVersion: 1 }],
        ["e2", { ruleId: 1, ruleVersion: 1 }],
      ]),
    );
    const stats = computeRuleStats(trips);
    expect(stats).toHaveLength(1);
    expect(stats[0].trades).toBe(2);
    expect(stats[0].winRate).toBeCloseTo(0.5);
    expect(stats[0].byExitKind["take-profit"].trades).toBe(1);
    expect(stats[0].byExitKind["stop-loss"].trades).toBe(1);
  });
});
