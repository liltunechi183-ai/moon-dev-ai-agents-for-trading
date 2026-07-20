export interface GradedDiscovery {
  status: "pending" | "approved" | "dismissed";
  angle: string | null;
  directionCorrect: boolean | null;
  returnPct: number | null;
  benchmarkReturnPct: number | null;
}

export interface AngleStat {
  angle: string;
  graded: number;
  wins: number;
}

export interface DiscoveryStats {
  graded: number;
  winRate: number | null;
  approvedWins: number;
  approvedGraded: number;
  dismissedWinners: number; // dismissed AND correct — "your pass cost you"
  avgReturnPct: number | null;
  avgExcessVsSpyPct: number | null;
  byAngle: AngleStat[];
}

/** PURE aggregation of the discovery track record. */
export function computeDiscoveryStats(rows: GradedDiscovery[]): DiscoveryStats {
  const graded = rows.filter((r) => r.directionCorrect !== null);
  if (graded.length === 0) {
    return {
      graded: 0,
      winRate: null,
      approvedWins: 0,
      approvedGraded: 0,
      dismissedWinners: 0,
      avgReturnPct: null,
      avgExcessVsSpyPct: null,
      byAngle: [],
    };
  }

  const wins = graded.filter((r) => r.directionCorrect).length;
  const approvedGradedRows = graded.filter((r) => r.status === "approved");
  const approvedWins = approvedGradedRows.filter((r) => r.directionCorrect).length;
  const dismissedWinners = graded.filter((r) => r.status === "dismissed" && r.directionCorrect).length;

  const withReturn = graded.filter((r) => r.returnPct !== null);
  const withBenchmark = graded.filter((r) => r.returnPct !== null && r.benchmarkReturnPct !== null);

  const angleMap = new Map<string, AngleStat>();
  for (const r of graded) {
    const angle = r.angle ?? "unknown";
    if (!angleMap.has(angle)) angleMap.set(angle, { angle, graded: 0, wins: 0 });
    const a = angleMap.get(angle)!;
    a.graded++;
    if (r.directionCorrect) a.wins++;
  }

  return {
    graded: graded.length,
    winRate: wins / graded.length,
    approvedWins,
    approvedGraded: approvedGradedRows.length,
    dismissedWinners,
    avgReturnPct:
      withReturn.length > 0 ? withReturn.reduce((a, r) => a + r.returnPct!, 0) / withReturn.length : null,
    avgExcessVsSpyPct:
      withBenchmark.length > 0
        ? withBenchmark.reduce((a, r) => a + (r.returnPct! - r.benchmarkReturnPct!), 0) / withBenchmark.length
        : null,
    byAngle: [...angleMap.values()].sort((a, b) => a.angle.localeCompare(b.angle)),
  };
}
