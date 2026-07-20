export interface BudgetCounts {
  predictions: number;
  shadows: number;
  backtests: number;
  lessons: number;
  discoveryScans: number; // DISTINCT scan_id, not rows
}

export const DAILY_TARGET = 60;

export type SheddableWork = "shadow" | "gauntlet" | "postmortem";

/** Total agent runs consumed today. One discovery scan is one model session
 * (counted as distinct scan_id) even though it writes several rows. */
export function totalRunsToday(counts: BudgetCounts): number {
  return (
    counts.predictions +
    counts.shadows +
    counts.backtests +
    counts.lessons +
    counts.discoveryScans
  );
}

/**
 * As the day runs hot we shed low-priority work in order: shadows first,
 * then gauntlet, then post-mortems. Live research, challenge chat, and
 * discovery scans are NEVER shed. Returns whether a given kind of work
 * should run right now.
 */
export function shouldRun(work: SheddableWork, counts: BudgetCounts, target = DAILY_TARGET): boolean {
  const used = totalRunsToday(counts);
  // Shed thresholds as fractions of the daily target.
  const thresholds: Record<SheddableWork, number> = {
    shadow: 0.7, // stop shadows at 70% of budget
    gauntlet: 0.85, // stop gauntlet at 85%
    postmortem: 1.0, // post-mortems last to go
  };
  return used < target * thresholds[work];
}

/** Human-readable budget summary for the Strategy page. */
export function budgetSummary(counts: BudgetCounts, target = DAILY_TARGET) {
  const used = totalRunsToday(counts);
  return {
    used,
    target,
    pctUsed: target > 0 ? used / target : 0,
    sheddingShadows: !shouldRun("shadow", counts, target),
    sheddingGauntlet: !shouldRun("gauntlet", counts, target),
    sheddingPostmortems: !shouldRun("postmortem", counts, target),
  };
}
