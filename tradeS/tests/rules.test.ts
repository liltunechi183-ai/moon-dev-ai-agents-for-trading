import { describe, it, expect } from "vitest";
import { evaluateRule, type RuleCondition, type RuleAction, type RuleEvalContext } from "@/lib/bot/rules";

const buyCondition: RuleCondition = {
  outlook: "bullish",
  minConfidence: 7,
  requiredPatterns: ["breakout"],
  maxRsi: 75,
  symbolScope: "all",
};

const buyAction: RuleAction = {
  side: "buy",
  notionalUsd: 500,
  orderType: "market",
  stopLossPct: 5,
};

function ctx(overrides: Partial<RuleEvalContext> = {}): RuleEvalContext {
  return {
    symbol: "AAPL",
    prediction: { outlook: "bullish", effectiveConfidence: 8, createdAt: Date.now() },
    detectedPatterns: ["breakout"],
    rsi14: 60,
    hasPosition: false,
    ...overrides,
  };
}

describe("evaluateRule", () => {
  it("matches the example rule: bullish >=7 + breakout", () => {
    expect(evaluateRule(buyCondition, buyAction, ctx())).toEqual({ match: true });
  });

  it("rejects when the effective (calibrated) confidence is below the gate", () => {
    const res = evaluateRule(buyCondition, buyAction, ctx({
      prediction: { outlook: "bullish", effectiveConfidence: 4, createdAt: Date.now() },
    }));
    expect(res.match).toBe(false);
  });

  it("rejects outlook mismatches", () => {
    const res = evaluateRule(buyCondition, buyAction, ctx({
      prediction: { outlook: "bearish", effectiveConfidence: 9, createdAt: Date.now() },
    }));
    expect(res.match).toBe(false);
  });

  it("rejects without the required pattern", () => {
    const res = evaluateRule(buyCondition, buyAction, ctx({ detectedPatterns: ["pullback"] }));
    expect(res.match).toBe(false);
  });

  it("rejects above maxRsi and when RSI is unavailable but bounded", () => {
    expect(evaluateRule(buyCondition, buyAction, ctx({ rsi14: 80 })).match).toBe(false);
    expect(evaluateRule(buyCondition, buyAction, ctx({ rsi14: null })).match).toBe(false);
  });

  it("buy rules skip symbols already held; sell rules need a position", () => {
    expect(evaluateRule(buyCondition, buyAction, ctx({ hasPosition: true })).match).toBe(false);
    const sellRes = evaluateRule(
      { ...buyCondition, outlook: "bearish", requiredPatterns: [] },
      { ...buyAction, side: "sell" },
      ctx({ hasPosition: false, prediction: { outlook: "bearish", effectiveConfidence: 8, createdAt: Date.now() } }),
    );
    expect(sellRes.match).toBe(false);
  });

  it("enforces symbol scope lists", () => {
    const scoped: RuleCondition = { ...buyCondition, symbolScope: ["TSLA"] };
    expect(evaluateRule(scoped, buyAction, ctx()).match).toBe(false);
    expect(evaluateRule(scoped, buyAction, ctx({ symbol: "TSLA" })).match).toBe(true);
  });

  it("rejects when there is no OK prediction", () => {
    expect(evaluateRule(buyCondition, buyAction, ctx({ prediction: null })).match).toBe(false);
  });
});
