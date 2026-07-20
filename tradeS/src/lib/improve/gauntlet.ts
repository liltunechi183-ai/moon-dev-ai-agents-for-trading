const HOLDOUT_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

export interface LessonWindow {
  symbol: string;
  /** The as-of date whose horizon window produced the lesson. */
  asOf: number;
  horizonDays: number;
}

/**
 * Anti-overfit holdout (PURE): a challenger derived from lessons must not be
 * re-examined on the very (symbol, window) pairs that produced those
 * lessons. Returns true if the candidate (symbol, asOf, horizon) overlaps —
 * within ±7 days — any lesson window for that symbol.
 */
export function overlapsLessonWindow(
  candidate: { symbol: string; asOf: number; horizonDays: number },
  lessonWindows: LessonWindow[],
): boolean {
  const candStart = candidate.asOf - HOLDOUT_WINDOW_DAYS * DAY_MS;
  const candEnd = candidate.asOf + candidate.horizonDays * DAY_MS + HOLDOUT_WINDOW_DAYS * DAY_MS;

  for (const lw of lessonWindows) {
    if (lw.symbol !== candidate.symbol) continue;
    const lessonStart = lw.asOf;
    const lessonEnd = lw.asOf + lw.horizonDays * DAY_MS;
    // Overlap if the intervals intersect.
    if (candStart <= lessonEnd && lessonStart <= candEnd) return true;
  }
  return false;
}

export { HOLDOUT_WINDOW_DAYS };
