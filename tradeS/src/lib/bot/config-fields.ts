/**
 * Field specs for the bot-config editor: the range each number may take, and
 * the units a human should see.
 *
 * Two of the stored values are fractions (0.1 = 10%). Showing a box labelled
 * "Cash reserve (0-0.9)" invites typing 10 for ten percent, which the API
 * rejects — and because the panel submits every field at once, that one
 * mistake blocks the limits the person actually came to change, with only a
 * generic "Could not save." to go on. So percents are edited as percents
 * here and converted on the way in and out, and the ranges live in one place
 * that both the input element and the pre-submit check read from.
 */

export type NumericConfigKey =
  | "budgetUsd"
  | "maxPositionUsd"
  | "maxTotalExposureUsd"
  | "maxDailyLossUsd"
  | "maxOrdersPerDay"
  | "cooldownMinutes"
  | "minConfidence"
  | "cashReservePct"
  | "maxSlicePct";

export interface FieldSpec {
  key: NumericConfigKey;
  label: string;
  /** Bounds in DISPLAY units, inclusive. */
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  /** stored = display / scale. 100 for percent fields, 1 for the rest. */
  scale: number;
}

export const BOT_CONFIG_FIELDS: FieldSpec[] = [
  { key: "budgetUsd", label: "Bot budget ($)", min: 1, max: 10_000_000, step: 100, scale: 1 },
  { key: "maxPositionUsd", label: "Max per stock ($)", min: 1, max: 1_000_000, step: 50, scale: 1 },
  {
    key: "maxTotalExposureUsd",
    label: "Max total exposure ($)",
    min: 1,
    max: 10_000_000,
    step: 100,
    scale: 1,
  },
  {
    key: "maxDailyLossUsd",
    label: "Daily loss halt ($)",
    min: 1,
    max: 1_000_000,
    step: 25,
    scale: 1,
  },
  {
    key: "maxOrdersPerDay",
    label: "Max orders / day",
    min: 1,
    max: 200,
    step: 1,
    integer: true,
    scale: 1,
  },
  {
    key: "cooldownMinutes",
    label: "Per-symbol cooldown (min)",
    min: 0,
    max: 10_080,
    step: 15,
    scale: 1,
  },
  {
    key: "minConfidence",
    label: "Min confidence (0-10)",
    min: 0,
    max: 10,
    step: 1,
    integer: true,
    scale: 1,
  },
  { key: "cashReservePct", label: "Cash reserve (%)", min: 0, max: 90, step: 5, scale: 100 },
  { key: "maxSlicePct", label: "Max slice of budget (%)", min: 1, max: 100, step: 5, scale: 100 },
];

/** Stored value → what the person sees in the box. */
export function toDisplay(stored: number, spec: FieldSpec): number {
  const scaled = stored * spec.scale;
  // 0.1 * 100 is 10.000000000000002; nobody wants to see that in an input.
  return Math.round(scaled * 1e6) / 1e6;
}

/** What the person typed → what gets stored. */
export function toStored(display: number, spec: FieldSpec): number {
  const scaled = display / spec.scale;
  return Math.round(scaled * 1e6) / 1e6;
}

/**
 * Why this value is not acceptable, in the person's own units, or null if it
 * is fine. Mirrors the server's schema so the mistake is caught before a
 * round trip that would reject the whole form.
 */
export function validateField(display: number, spec: FieldSpec): string | null {
  if (!Number.isFinite(display)) return `${spec.label}: enter a number`;
  if (spec.integer && !Number.isInteger(display)) return `${spec.label}: must be a whole number`;
  if (display < spec.min || display > spec.max) {
    return `${spec.label}: must be between ${spec.min} and ${spec.max}`;
  }
  return null;
}

/** Every problem in the draft, so the person sees all of them at once. */
export function validateDraft(
  draft: Partial<Record<NumericConfigKey, number>>,
  fields: FieldSpec[] = BOT_CONFIG_FIELDS,
): string[] {
  const errors: string[] = [];
  for (const spec of fields) {
    const value = draft[spec.key];
    if (value === undefined) continue;
    const error = validateField(value, spec);
    if (error) errors.push(error);
  }
  return errors;
}
