import { describe, it, expect } from "vitest";
import { computeBudgetNotional, type BudgetSizingInput } from "@/lib/bot/sizing";

function input(overrides: Partial<BudgetSizingInput> = {}): BudgetSizingInput {
  return {
    budgetUsd: 10_000,
    effectiveConfidence: 10,
    maxPositionUsd: 2000,
    symbolExposureUsd: 0,
    totalExposureUsd: 0,
    cashUsd: 10_000,
    cashReservePct: 0.1,
    price: 100,
    ...overrides,
  };
}

describe("computeBudgetNotional", () => {
  it("takes a full slice at confidence 10 (20% of budget by default)", () => {
    const res = computeBudgetNotional(input());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.shares).toBe(20); // 10000 * 0.2 = 2000 / 100
      expect(res.notionalUsd).toBe(2000);
    }
  });

  it("scales the slice with confidence", () => {
    const res = computeBudgetNotional(input({ effectiveConfidence: 5 }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notionalUsd).toBe(1000); // half the full slice
  });

  it("clamps by the per-stock cap minus existing symbol exposure", () => {
    const res = computeBudgetNotional(input({ symbolExposureUsd: 1500 }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notionalUsd).toBeLessThanOrEqual(500);
  });

  it("clamps by free budget", () => {
    const res = computeBudgetNotional(input({ totalExposureUsd: 9500 }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notionalUsd).toBeLessThanOrEqual(500);
  });

  it("respects the cash reserve", () => {
    const res = computeBudgetNotional(input({ cashUsd: 1200 })); // reserve 1000 → only 200 free
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notionalUsd).toBeLessThanOrEqual(200);
  });

  it("floors to whole shares", () => {
    const res = computeBudgetNotional(input({ price: 333 }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Number.isInteger(res.shares)).toBe(true);
      expect(res.notionalUsd).toBe(res.shares * 333);
    }
  });

  it("skips with 'waiting for room' when the slice can't buy one share", () => {
    const res = computeBudgetNotional(input({ price: 5000 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("waiting for room");
  });

  it("skips when caps leave no room at all", () => {
    const res = computeBudgetNotional(input({ symbolExposureUsd: 2000 }));
    expect(res.ok).toBe(false);
  });

  it("skips at zero effective confidence", () => {
    const res = computeBudgetNotional(input({ effectiveConfidence: 0 }));
    expect(res.ok).toBe(false);
  });
});
