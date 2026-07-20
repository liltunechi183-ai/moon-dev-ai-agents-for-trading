import { describe, it, expect } from "vitest";
import { checkSafeguards, type SafeguardInput } from "@/lib/bot/safeguards";

function input(overrides: Partial<SafeguardInput> = {}): SafeguardInput {
  return {
    tradingBaseUrl: "https://paper-api.alpaca.markets",
    allowLiveEnv: false,
    liveKeysInUse: false,
    liveAckOk: false,
    marketOpen: true,
    predictionAgeMs: 60_000,
    dayStartEquity: 100_000,
    currentEquity: 100_000,
    maxDailyLossUsd: 500,
    orderNotionalUsd: 500,
    symbolExposureUsd: 0,
    totalExposureUsd: 0,
    maxPositionUsd: 2000,
    maxTotalExposureUsd: 10_000,
    ordersToday: 0,
    maxOrdersPerDay: 10,
    lastOrderForSymbolAt: null,
    cooldownMinutes: 60,
    now: Date.now(),
    ...overrides,
  };
}

describe("checkSafeguards", () => {
  it("passes a clean paper order", () => {
    expect(checkSafeguards(input())).toEqual({ ok: true });
  });

  it("refuses a live host without the triple unlock — even with a closed market etc.", () => {
    const res = checkSafeguards(input({ tradingBaseUrl: "https://api.alpaca.markets" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("LIVE");
  });

  it("refuses a live host when only two of three unlocks hold", () => {
    for (const partial of [
      { allowLiveEnv: true, liveKeysInUse: true, liveAckOk: false },
      { allowLiveEnv: true, liveKeysInUse: false, liveAckOk: true },
      { allowLiveEnv: false, liveKeysInUse: true, liveAckOk: true },
    ]) {
      const res = checkSafeguards(input({ tradingBaseUrl: "https://api.alpaca.markets", ...partial }));
      expect(res.ok).toBe(false);
    }
  });

  it("allows a live host with all three unlocks", () => {
    const res = checkSafeguards(
      input({
        tradingBaseUrl: "https://api.alpaca.markets",
        allowLiveEnv: true,
        liveKeysInUse: true,
        liveAckOk: true,
      }),
    );
    expect(res.ok).toBe(true);
  });

  it("blocks when the market is closed", () => {
    const res = checkSafeguards(input({ marketOpen: false }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("closed");
  });

  it("blocks stale predictions (>24h)", () => {
    const res = checkSafeguards(input({ predictionAgeMs: 25 * 60 * 60_000 }));
    expect(res.ok).toBe(false);
  });

  it("trips the daily-loss circuit breaker with halt", () => {
    const res = checkSafeguards(input({ currentEquity: 99_400 })); // lost 600 >= 500
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.halt).toBe(true);
  });

  it("enforces the per-symbol cap", () => {
    const res = checkSafeguards(input({ symbolExposureUsd: 1800, orderNotionalUsd: 500 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("per-stock");
  });

  it("enforces the total exposure cap", () => {
    const res = checkSafeguards(input({ totalExposureUsd: 9800, orderNotionalUsd: 500 }));
    expect(res.ok).toBe(false);
  });

  it("enforces the orders-per-day cap", () => {
    const res = checkSafeguards(input({ ordersToday: 10 }));
    expect(res.ok).toBe(false);
  });

  it("enforces the per-symbol cooldown", () => {
    const now = Date.now();
    const res = checkSafeguards(input({ now, lastOrderForSymbolAt: now - 10 * 60_000, cooldownMinutes: 60 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("cooldown");
  });

  it("passes once the cooldown has elapsed", () => {
    const now = Date.now();
    const res = checkSafeguards(input({ now, lastOrderForSymbolAt: now - 61 * 60_000, cooldownMinutes: 60 }));
    expect(res.ok).toBe(true);
  });
});
