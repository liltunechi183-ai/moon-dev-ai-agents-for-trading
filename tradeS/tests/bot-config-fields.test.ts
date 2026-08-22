import { describe, it, expect } from "vitest";
import {
  BOT_CONFIG_FIELDS,
  toDisplay,
  toStored,
  validateField,
  validateDraft,
  type FieldSpec,
} from "@/lib/bot/config-fields";

const spec = (key: string): FieldSpec => {
  const found = BOT_CONFIG_FIELDS.find((f) => f.key === key);
  if (!found) throw new Error(`no spec for ${key}`);
  return found;
};

describe("percent fields round-trip between stored fractions and shown percents", () => {
  it("shows a stored 0.1 as 10%", () => {
    expect(toDisplay(0.1, spec("cashReservePct"))).toBe(10);
  });

  it("stores a typed 10% as 0.1", () => {
    expect(toStored(10, spec("cashReservePct"))).toBe(0.1);
  });

  it("does not leak floating-point noise into the input box", () => {
    // 0.1 * 100 is 10.000000000000002 without rounding.
    expect(String(toDisplay(0.1, spec("cashReservePct")))).toBe("10");
    expect(String(toDisplay(0.07, spec("maxSlicePct")))).toBe("7");
  });

  it("round-trips every percent value the UI can produce", () => {
    const s = spec("maxSlicePct");
    for (let pct = s.min; pct <= s.max; pct += s.step) {
      expect(toDisplay(toStored(pct, s), s)).toBe(pct);
    }
  });

  it("leaves plain dollar fields untouched", () => {
    expect(toDisplay(500, spec("maxPositionUsd"))).toBe(500);
    expect(toStored(500, spec("maxPositionUsd"))).toBe(500);
  });
});

describe("validateField", () => {
  it("accepts a percent typed as a percent", () => {
    expect(validateField(10, spec("cashReservePct"))).toBeNull();
  });

  it("regression: the old fraction-style entry is now out of range, not silently stored", () => {
    // Under the old labelling people typed 0.1 meaning 10%; now 0.1 is
    // sub-one-percent and 100 exceeds the 90 cap — both must be caught here
    // rather than by a 400 that discards the whole form.
    expect(validateField(100, spec("cashReservePct"))).toContain("between 0 and 90");
  });

  it("rejects values outside the range with the bounds spelled out", () => {
    const err = validateField(11, spec("minConfidence"));
    expect(err).toContain("between 0 and 10");
  });

  it("rejects fractions where only whole numbers make sense", () => {
    expect(validateField(2.5, spec("maxOrdersPerDay"))).toContain("whole number");
  });

  it("rejects a blank or unparseable box", () => {
    expect(validateField(NaN, spec("budgetUsd"))).toContain("enter a number");
  });

  it("accepts the exact boundaries", () => {
    expect(validateField(0, spec("cashReservePct"))).toBeNull();
    expect(validateField(90, spec("cashReservePct"))).toBeNull();
    expect(validateField(0, spec("minConfidence"))).toBeNull();
    expect(validateField(10, spec("minConfidence"))).toBeNull();
  });
});

describe("validateDraft", () => {
  it("passes a sensible small-account setup", () => {
    expect(
      validateDraft({
        budgetUsd: 3000,
        maxPositionUsd: 500,
        maxTotalExposureUsd: 2400,
        cashReservePct: 10,
        maxSlicePct: 20,
      }),
    ).toEqual([]);
  });

  it("reports every bad field at once, not just the first", () => {
    const errors = validateDraft({ minConfidence: 99, cashReservePct: 500, maxOrdersPerDay: 1.5 });
    expect(errors).toHaveLength(3);
  });

  it("ignores fields the draft does not carry", () => {
    expect(validateDraft({ maxPositionUsd: 500 })).toEqual([]);
  });
});
