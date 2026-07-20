import { describe, it, expect } from "vitest";
import { overlapsLessonWindow, type LessonWindow } from "@/lib/improve/gauntlet";

const DAY = 86_400_000;

describe("overlapsLessonWindow", () => {
  const lessons: LessonWindow[] = [{ symbol: "AAPL", asOf: 1000 * DAY, horizonDays: 30 }];

  it("flags a candidate whose window overlaps a lesson window for the same symbol", () => {
    const overlap = overlapsLessonWindow({ symbol: "AAPL", asOf: 1010 * DAY, horizonDays: 30 }, lessons);
    expect(overlap).toBe(true);
  });

  it("flags a candidate within the ±7 day buffer even without direct overlap", () => {
    // Lesson window is [1000, 1030]. Candidate horizon ends at 1035, then +7 buffer.
    const overlap = overlapsLessonWindow({ symbol: "AAPL", asOf: 1034 * DAY, horizonDays: 1 }, lessons);
    expect(overlap).toBe(true);
  });

  it("allows a candidate far from any lesson window", () => {
    const overlap = overlapsLessonWindow({ symbol: "AAPL", asOf: 2000 * DAY, horizonDays: 30 }, lessons);
    expect(overlap).toBe(false);
  });

  it("does not flag a different symbol in the same window", () => {
    const overlap = overlapsLessonWindow({ symbol: "MSFT", asOf: 1010 * DAY, horizonDays: 30 }, lessons);
    expect(overlap).toBe(false);
  });

  it("returns false with no lesson windows", () => {
    expect(overlapsLessonWindow({ symbol: "AAPL", asOf: 1000 * DAY, horizonDays: 30 }, [])).toBe(false);
  });
});
