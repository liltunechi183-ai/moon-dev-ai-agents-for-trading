import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { gradeDirection, type Outlook } from "./grading";
import { confidenceBucket } from "./calibration";
import type { IndicatorSnapshot } from "@/lib/quant/types";

export interface GradedRow {
  outlook: Outlook;
  confidence: number;
  algoVersion: number | null;
  regime: string | null;
  returnPct: number;
  directionCorrect: boolean;
  neutralBandPct: number | null;
  benchmarkReturnPct: number | null;
  quantSnapshot: { indicators: IndicatorSnapshot } | null;
}

export interface BucketStat {
  label: string;
  samples: number;
  winRate: number;
}

export interface AccuracyStats {
  graded: number;
  winRate: number | null;
  avgReturnPct: number | null;
  avgExcessVsSpyPct: number | null; // mean (return - SPY) on rows with a benchmark
  byOutlook: BucketStat[];
  byConfidence: BucketStat[];
  byVersion: BucketStat[];
  byRegime: BucketStat[];
  baselines: {
    /** "Always bullish" graded on the identical windows. */
    alwaysBullishWinRate: number | null;
    /** Sign of price-vs-SMA50 at prediction time, graded on the same windows. */
    momentumWinRate: number | null;
  };
}

function bucketize(rows: GradedRow[], key: (r: GradedRow) => string): BucketStat[] {
  const groups = new Map<string, GradedRow[]>();
  for (const r of rows) {
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      samples: group.length,
      winRate: group.filter((g) => g.directionCorrect).length / group.length,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Pure aggregation, exported for tests. */
export function computeAccuracy(rows: GradedRow[]): AccuracyStats {
  if (rows.length === 0) {
    return {
      graded: 0,
      winRate: null,
      avgReturnPct: null,
      avgExcessVsSpyPct: null,
      byOutlook: [],
      byConfidence: [],
      byVersion: [],
      byRegime: [],
      baselines: { alwaysBullishWinRate: null, momentumWinRate: null },
    };
  }

  const wins = rows.filter((r) => r.directionCorrect).length;
  const withBenchmark = rows.filter((r) => r.benchmarkReturnPct !== null);

  // Baseline 1: always-bullish on the identical windows.
  const alwaysBullishWins = rows.filter((r) => r.returnPct > 0).length;

  // Baseline 2: 50-day momentum — direction from price vs SMA50 at prediction
  // time, graded with the same band on the same window.
  const momentumRows = rows.filter(
    (r) =>
      r.quantSnapshot?.indicators?.lastClose != null && r.quantSnapshot.indicators.sma50 != null,
  );
  const momentumWins = momentumRows.filter((r) => {
    const ind = r.quantSnapshot!.indicators;
    const call: Outlook = ind.lastClose! >= ind.sma50! ? "bullish" : "bearish";
    return gradeDirection(call, r.returnPct, r.neutralBandPct ?? 3);
  }).length;

  return {
    graded: rows.length,
    winRate: wins / rows.length,
    avgReturnPct: rows.reduce((a, r) => a + r.returnPct, 0) / rows.length,
    avgExcessVsSpyPct:
      withBenchmark.length > 0
        ? withBenchmark.reduce((a, r) => a + (r.returnPct - r.benchmarkReturnPct!), 0) /
          withBenchmark.length
        : null,
    byOutlook: bucketize(rows, (r) => r.outlook),
    byConfidence: bucketize(rows, (r) => confidenceBucket(r.confidence)),
    byVersion: bucketize(rows, (r) => `v${r.algoVersion ?? 1}`),
    byRegime: bucketize(
      rows.filter((r) => r.regime !== null),
      (r) => r.regime!,
    ),
    baselines: {
      alwaysBullishWinRate: alwaysBullishWins / rows.length,
      momentumWinRate: momentumRows.length > 0 ? momentumWins / momentumRows.length : null,
    },
  };
}

export function loadGradedRows(): GradedRow[] {
  return db
    .select({
      outlook: tables.predictions.outlook,
      confidence: tables.predictions.confidence,
      algoVersion: tables.predictions.algoVersion,
      regime: tables.predictions.regime,
      returnPct: tables.predictionOutcomes.returnPct,
      directionCorrect: tables.predictionOutcomes.directionCorrect,
      neutralBandPct: tables.predictionOutcomes.neutralBandPct,
      benchmarkReturnPct: tables.predictionOutcomes.benchmarkReturnPct,
      quantSnapshot: tables.predictions.quantSnapshot,
    })
    .from(tables.predictionOutcomes)
    .innerJoin(tables.predictions, eq(tables.predictionOutcomes.predictionId, tables.predictions.id))
    .where(eq(tables.predictions.status, "ok"))
    .all() as GradedRow[];
}
