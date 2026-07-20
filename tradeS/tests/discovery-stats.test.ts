import { describe, it, expect } from "vitest";
import { computeDiscoveryStats, type GradedDiscovery } from "@/lib/discovery/stats";

function row(overrides: Partial<GradedDiscovery> = {}): GradedDiscovery {
  return {
    status: "pending",
    angle: "second-order",
    directionCorrect: true,
    returnPct: 5,
    benchmarkReturnPct: 2,
    ...overrides,
  };
}

describe("computeDiscoveryStats", () => {
  it("returns empty stats when nothing is graded", () => {
    const stats = computeDiscoveryStats([row({ directionCorrect: null })]);
    expect(stats.graded).toBe(0);
    expect(stats.winRate).toBeNull();
  });

  it("computes win rate over graded picks only", () => {
    const stats = computeDiscoveryStats([
      row({ directionCorrect: true }),
      row({ directionCorrect: false }),
      row({ directionCorrect: null }), // not yet graded — excluded
    ]);
    expect(stats.graded).toBe(2);
    expect(stats.winRate).toBeCloseTo(0.5);
  });

  it("tracks approved wins and dismissed winners (the 'your pass cost you' signal)", () => {
    const stats = computeDiscoveryStats([
      row({ status: "approved", directionCorrect: true }),
      row({ status: "approved", directionCorrect: false }),
      row({ status: "dismissed", directionCorrect: true }), // dismissed winner
      row({ status: "dismissed", directionCorrect: false }),
    ]);
    expect(stats.approvedGraded).toBe(2);
    expect(stats.approvedWins).toBe(1);
    expect(stats.dismissedWinners).toBe(1);
  });

  it("computes excess vs SPY only over rows with a benchmark", () => {
    const stats = computeDiscoveryStats([
      row({ returnPct: 10, benchmarkReturnPct: 4 }),
      row({ returnPct: 6, benchmarkReturnPct: null }), // no benchmark — excluded from excess
    ]);
    expect(stats.avgExcessVsSpyPct).toBeCloseTo(6);
    expect(stats.avgReturnPct).toBeCloseTo(8); // avg return still counts both
  });

  it("buckets by angle", () => {
    const stats = computeDiscoveryStats([
      row({ angle: "dislocation", directionCorrect: true }),
      row({ angle: "dislocation", directionCorrect: false }),
      row({ angle: "commodity-chain", directionCorrect: true }),
    ]);
    const dis = stats.byAngle.find((a) => a.angle === "dislocation");
    expect(dis).toEqual({ angle: "dislocation", graded: 2, wins: 1 });
  });

  it("handles a null angle as 'unknown'", () => {
    const stats = computeDiscoveryStats([row({ angle: null })]);
    expect(stats.byAngle[0].angle).toBe("unknown");
  });
});
