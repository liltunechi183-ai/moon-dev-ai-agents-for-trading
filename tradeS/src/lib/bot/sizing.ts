export interface BudgetSizingInput {
  /** Total dollars the bot may deploy. */
  budgetUsd: number;
  /** Calibrated confidence 0-10 (never the raw self-report). */
  effectiveConfidence: number;
  /** Per-stock cap. */
  maxPositionUsd: number;
  /** Bot's current exposure in this symbol. */
  symbolExposureUsd: number;
  /** Bot's current total exposure across symbols. */
  totalExposureUsd: number;
  /** Account cash available. */
  cashUsd: number;
  /** Fraction of budget always kept in cash (0..1). */
  cashReservePct: number;
  /** Current share price (bracket orders need whole shares). */
  price: number;
  /** Largest slice of the budget one order may take at confidence 10 (0..1). */
  maxSlicePct?: number;
}

export type BudgetSizingResult =
  | { ok: true; shares: number; notionalUsd: number }
  | { ok: false; reason: string };

/**
 * Budget-mode sizing (pure): a confidence-scaled slice of the budget,
 * clamped by the per-stock cap, then by free budget minus the cash
 * reserve, then floored to whole shares. Nothing survives → "waiting for
 * room" skip.
 */
export function computeBudgetNotional(input: BudgetSizingInput): BudgetSizingResult {
  const maxSlicePct = input.maxSlicePct ?? 0.2;
  if (input.price <= 0) return { ok: false, reason: "no usable price" };
  if (input.effectiveConfidence <= 0) return { ok: false, reason: "effective confidence is 0" };

  // Confidence-scaled slice of the whole budget.
  let notional = input.budgetUsd * maxSlicePct * (input.effectiveConfidence / 10);

  // Per-stock cap (minus what's already in this symbol).
  notional = Math.min(notional, input.maxPositionUsd - input.symbolExposureUsd);

  // Free budget.
  notional = Math.min(notional, input.budgetUsd - input.totalExposureUsd);

  // Cash minus reserve.
  const reserve = input.budgetUsd * input.cashReservePct;
  notional = Math.min(notional, input.cashUsd - reserve);

  if (notional <= 0) return { ok: false, reason: "waiting for room (budget, caps, or cash reserve)" };

  const shares = Math.floor(notional / input.price);
  if (shares < 1) {
    return { ok: false, reason: `waiting for room (slice $${notional.toFixed(0)} < 1 share at $${input.price.toFixed(2)})` };
  }

  return { ok: true, shares, notionalUsd: shares * input.price };
}
