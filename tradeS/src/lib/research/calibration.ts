import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import type { Outlook } from "./grading";

export const MIN_SEGMENT_SAMPLES = 8;

/**
 * Map a measured win rate to the confidence it has EARNED:
 * 50% -> 0, 75% -> 5, 100% -> 10 (linear, clamped to 0..10).
 */
export function earnedConfidence(winRate: number): number {
  const mapped = (winRate - 0.5) * 20;
  return Math.min(10, Math.max(0, mapped));
}

export function confidenceBucket(confidence: number): "low" | "mid" | "high" {
  if (confidence >= 7) return "high";
  if (confidence >= 4) return "mid";
  return "low";
}

/**
 * Pure capping rule: a self-reported confidence is capped at what its
 * segment's measured win rate has earned — but only for directional calls
 * with enough graded history. Neutral and thin segments pass through.
 * The raw stored confidence is NEVER mutated; this applies at read/decision
 * seams only.
 */
export function capConfidence(
  outlook: Outlook,
  rawConfidence: number,
  segmentWinRate: number | null,
  segmentSamples: number,
): { effective: number; capped: boolean } {
  if (outlook === "neutral" || segmentWinRate === null || segmentSamples < MIN_SEGMENT_SAMPLES) {
    return { effective: rawConfidence, capped: false };
  }
  const earned = Math.round(earnedConfidence(segmentWinRate));
  if (earned < rawConfidence) return { effective: earned, capped: true };
  return { effective: rawConfidence, capped: false };
}

export interface SegmentStats {
  samples: number;
  winRate: number | null;
}

interface GradedCall {
  outlook: Outlook;
  confidence: number;
  directionCorrect: boolean;
}

function loadGradedCalls(): GradedCall[] {
  return db
    .select({
      outlook: tables.predictions.outlook,
      confidence: tables.predictions.confidence,
      directionCorrect: tables.predictionOutcomes.directionCorrect,
    })
    .from(tables.predictionOutcomes)
    .innerJoin(tables.predictions, eq(tables.predictionOutcomes.predictionId, tables.predictions.id))
    .where(eq(tables.predictions.status, "ok"))
    .all() as GradedCall[];
}

/** Pure aggregation, exported for tests. */
export function segmentStatsFrom(
  calls: GradedCall[],
  outlook: Outlook,
  confidence: number,
): SegmentStats {
  const bucket = confidenceBucket(confidence);
  const segment = calls.filter(
    (c) => c.outlook === outlook && confidenceBucket(c.confidence) === bucket,
  );
  if (segment.length === 0) return { samples: 0, winRate: null };
  const wins = segment.filter((c) => c.directionCorrect).length;
  return { samples: segment.length, winRate: wins / segment.length };
}

/**
 * The bot gates and sizes on this; the UI shows earned vs raw.
 * Reads the graded history from the DB.
 */
export function effectiveConfidence(
  outlook: Outlook,
  rawConfidence: number,
): { effective: number; capped: boolean; segment: SegmentStats } {
  const calls = loadGradedCalls();
  const segment = segmentStatsFrom(calls, outlook, rawConfidence);
  const { effective, capped } = capConfidence(outlook, rawConfidence, segment.winRate, segment.samples);
  return { effective, capped, segment };
}

/**
 * Self-calibration block injected into every analyst prompt so the model
 * sees its own measured record before predicting. Empty string when there
 * is no graded history yet.
 */
export function buildTrackRecord(): string {
  const calls = loadGradedCalls();
  if (calls.length < 5) return "";

  const lines: string[] = [`Graded calls so far: ${calls.length}.`];
  const overallWins = calls.filter((c) => c.directionCorrect).length;
  lines.push(`Overall directional win rate: ${((overallWins / calls.length) * 100).toFixed(0)}%.`);

  for (const outlook of ["bullish", "neutral", "bearish"] as const) {
    const seg = calls.filter((c) => c.outlook === outlook);
    if (seg.length === 0) continue;
    const wins = seg.filter((c) => c.directionCorrect).length;
    lines.push(`${outlook}: ${wins}/${seg.length} correct (${((wins / seg.length) * 100).toFixed(0)}%).`);
  }
  for (const bucket of ["high", "mid", "low"] as const) {
    const seg = calls.filter((c) => confidenceBucket(c.confidence) === bucket);
    if (seg.length === 0) continue;
    const wins = seg.filter((c) => c.directionCorrect).length;
    lines.push(
      `confidence ${bucket}: ${wins}/${seg.length} correct (${((wins / seg.length) * 100).toFixed(0)}%).`,
    );
  }
  return lines.join("\n");
}
