import { describe, it, expect } from "vitest";
import { orderToRow, findParentIdInRaw, isTerminalStatus } from "@/lib/alpaca/orders-log";
import type { AlpacaOrder } from "@/lib/alpaca/client";

function makeOrder(overrides: Partial<AlpacaOrder> = {}): AlpacaOrder {
  return {
    id: "ord-1",
    client_order_id: "c-1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: "10",
    notional: null,
    status: "new",
    filled_avg_price: null,
    submitted_at: "2026-07-20T14:30:00Z",
    ...overrides,
  } as AlpacaOrder;
}

describe("orderToRow", () => {
  it("maps an Alpaca order to a row with numeric fields parsed", () => {
    const row = orderToRow(makeOrder({ filled_avg_price: "123.45", status: "filled" }), "bot", null);
    expect(row.alpacaOrderId).toBe("ord-1");
    expect(row.symbol).toBe("AAPL");
    expect(row.qty).toBe(10);
    expect(row.filledAvgPrice).toBeCloseTo(123.45);
    expect(row.source).toBe("bot");
    expect(row.submittedAt).toBe(Date.parse("2026-07-20T14:30:00Z"));
  });

  it("converts alpaca dot notation to app dash notation", () => {
    const row = orderToRow(makeOrder({ symbol: "BRK.B" }), "manual", null);
    expect(row.symbol).toBe("BRK-B");
  });

  it("records the parent link for bracket legs", () => {
    const row = orderToRow(makeOrder({ id: "leg-1" }), "bot", "parent-1");
    expect(row.parentOrderId).toBe("parent-1");
  });
});

describe("findParentIdInRaw", () => {
  it("finds the parent whose raw legs mention the orphan id", () => {
    const candidates = [
      { alpacaOrderId: "p-1", raw: { legs: [{ id: "leg-a" }, { id: "leg-b" }] } },
      { alpacaOrderId: "p-2", raw: { legs: [{ id: "leg-c" }] } },
    ];
    expect(findParentIdInRaw(candidates, "leg-c")).toBe("p-2");
    expect(findParentIdInRaw(candidates, "leg-a")).toBe("p-1");
  });

  it("returns null when no candidate mentions the id", () => {
    const candidates = [
      { alpacaOrderId: "p-1", raw: { legs: [] } },
      { alpacaOrderId: "p-2", raw: null },
      { alpacaOrderId: "p-3", raw: {} },
    ];
    expect(findParentIdInRaw(candidates, "leg-x")).toBeNull();
  });
});

describe("isTerminalStatus", () => {
  it("treats filled/canceled/expired/rejected as terminal", () => {
    for (const s of ["filled", "canceled", "expired", "rejected"]) {
      expect(isTerminalStatus(s)).toBe(true);
    }
  });
  it("treats new/partially_filled/accepted as open", () => {
    for (const s of ["new", "partially_filled", "accepted", "pending_new"]) {
      expect(isTerminalStatus(s)).toBe(false);
    }
  });
});
