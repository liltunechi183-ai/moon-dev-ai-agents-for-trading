import { z } from "zod";

export const RuleConditionSchema = z.object({
  outlook: z.enum(["bullish", "neutral", "bearish"]),
  minConfidence: z.number().int().min(0).max(10),
  requiredPatterns: z.array(z.string()).optional(),
  maxRsi: z.number().min(0).max(100).optional(),
  minRsi: z.number().min(0).max(100).optional(),
  symbolScope: z.union([z.literal("all"), z.array(z.string().min(1))]),
});

export const RuleActionSchema = z.object({
  side: z.enum(["buy", "sell"]),
  notionalUsd: z.number().positive(),
  orderType: z.literal("market"),
  stopLossPct: z.number().min(0.5).max(50),
  takeProfitPct: z.number().min(0.5).max(500).optional(),
});

export type RuleCondition = z.infer<typeof RuleConditionSchema>;
export type RuleAction = z.infer<typeof RuleActionSchema>;

export interface RuleEvalContext {
  symbol: string;
  /** Latest prediction, already filtered to status === "ok"; null when none. */
  prediction: {
    outlook: "bullish" | "neutral" | "bearish";
    effectiveConfidence: number;
    createdAt: number;
  } | null;
  detectedPatterns: string[];
  rsi14: number | null;
  hasPosition: boolean;
}

export type RuleEvalResult = { match: true } | { match: false; reason: string };

/**
 * Pure rule evaluation. The confidence gate uses the EFFECTIVE (calibrated)
 * confidence, never the raw self-report.
 */
export function evaluateRule(
  condition: RuleCondition,
  action: RuleAction,
  ctx: RuleEvalContext,
): RuleEvalResult {
  if (condition.symbolScope !== "all" && !condition.symbolScope.includes(ctx.symbol)) {
    return { match: false, reason: `${ctx.symbol} is outside this rule's symbol scope` };
  }
  if (action.side === "buy" && ctx.hasPosition) {
    return { match: false, reason: "already holding a position" };
  }
  if (action.side === "sell" && !ctx.hasPosition) {
    return { match: false, reason: "no position to sell" };
  }
  if (!ctx.prediction) {
    return { match: false, reason: "no OK prediction available" };
  }
  if (ctx.prediction.outlook !== condition.outlook) {
    return {
      match: false,
      reason: `prediction is ${ctx.prediction.outlook}, rule needs ${condition.outlook}`,
    };
  }
  if (ctx.prediction.effectiveConfidence < condition.minConfidence) {
    return {
      match: false,
      reason: `effective confidence ${ctx.prediction.effectiveConfidence} < required ${condition.minConfidence}`,
    };
  }
  for (const pattern of condition.requiredPatterns ?? []) {
    if (!ctx.detectedPatterns.includes(pattern)) {
      return { match: false, reason: `required pattern "${pattern}" not detected` };
    }
  }
  if (condition.maxRsi != null) {
    if (ctx.rsi14 === null) return { match: false, reason: "RSI unavailable but rule bounds it" };
    if (ctx.rsi14 > condition.maxRsi) {
      return { match: false, reason: `RSI ${ctx.rsi14.toFixed(0)} above max ${condition.maxRsi}` };
    }
  }
  if (condition.minRsi != null) {
    if (ctx.rsi14 === null) return { match: false, reason: "RSI unavailable but rule bounds it" };
    if (ctx.rsi14 < condition.minRsi) {
      return { match: false, reason: `RSI ${ctx.rsi14.toFixed(0)} below min ${condition.minRsi}` };
    }
  }
  return { match: true };
}
