import { describe, it, expect } from "vitest";
import { totalRunsToday, shouldRun, budgetSummary, DAILY_TARGET, type BudgetCounts } from "@/lib/improve/budget";

function counts(overrides: Partial<BudgetCounts> = {}): BudgetCounts {
  return { predictions: 0, shadows: 0, backtests: 0, lessons: 0, discoveryScans: 0, ...overrides };
}

describe("totalRunsToday", () => {
  it("sums all agent-run categories (scans counted as sessions)", () => {
    expect(
      totalRunsToday(counts({ predictions: 10, shadows: 5, backtests: 3, lessons: 2, discoveryScans: 1 })),
    ).toBe(21);
  });
});

describe("shouldRun shedding order", () => {
  it("runs everything on a quiet day", () => {
    const c = counts({ predictions: 5 });
    expect(shouldRun("shadow", c)).toBe(true);
    expect(shouldRun("gauntlet", c)).toBe(true);
    expect(shouldRun("postmortem", c)).toBe(true);
  });

  it("sheds shadows first as the day heats up", () => {
    const c = counts({ predictions: Math.floor(DAILY_TARGET * 0.75) });
    expect(shouldRun("shadow", c)).toBe(false);
    expect(shouldRun("gauntlet", c)).toBe(true);
    expect(shouldRun("postmortem", c)).toBe(true);
  });

  it("then sheds gauntlet, keeping post-mortems longest", () => {
    const c = counts({ predictions: Math.floor(DAILY_TARGET * 0.9) });
    expect(shouldRun("shadow", c)).toBe(false);
    expect(shouldRun("gauntlet", c)).toBe(false);
    expect(shouldRun("postmortem", c)).toBe(true);
  });

  it("sheds post-mortems once the target is hit", () => {
    const c = counts({ predictions: DAILY_TARGET });
    expect(shouldRun("postmortem", c)).toBe(false);
  });
});

describe("budgetSummary", () => {
  it("reports usage and shedding flags", () => {
    const s = budgetSummary(counts({ predictions: 45 }));
    expect(s.used).toBe(45);
    expect(s.target).toBe(DAILY_TARGET);
    expect(s.sheddingShadows).toBe(true);
    expect(s.sheddingGauntlet).toBe(false);
  });
});
