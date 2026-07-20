import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { computeScorecard, type PairedSample, type Scorecard } from "./scorecard";
import { getStrategyVersion } from "@/lib/research/strategy";

const MIN_PAIRS_QUANT = 60; // paired sims in backtests
const MIN_PAIRS_FULL = 20; // graded shadow_predictions paired to live rows
const MAX_PROMOTIONS_PER_QUARTER = 4;
const ROLLBACK_TRAIL_POINTS = 10; // trail parent's live win rate by >10pt
const ROLLBACK_MIN_LIVE = 30; // ...after >=30 graded live calls

/** Build paired samples for a quant/both challenger from the backtests table:
 * champion and challenger rows sharing the same (symbol, asOf). */
function buildQuantPairs(challengerVersion: number): PairedSample[] {
  const challengerRows = db
    .select()
    .from(tables.backtests)
    .where(eq(tables.backtests.algoVersion, challengerVersion))
    .all();

  const pairs: PairedSample[] = [];
  for (const ch of challengerRows) {
    // Find the champion row for the same symbol+asOf (a different version).
    const champ = db
      .select()
      .from(tables.backtests)
      .where(and(eq(tables.backtests.symbol, ch.symbol), eq(tables.backtests.asOf, ch.asOf)))
      .all()
      .find((r) => r.algoVersion !== challengerVersion);
    if (!champ) continue;
    pairs.push({
      championCorrect: champ.directionCorrect,
      challengerCorrect: ch.directionCorrect,
      championOutlook: champ.outlook,
      challengerOutlook: ch.outlook,
      returnPct: ch.returnPct,
      championConfidence: champ.confidence,
      challengerConfidence: ch.confidence,
      regime: ch.regime,
    });
  }
  return pairs;
}

/** Build paired samples for a full/both challenger from graded
 * shadow_predictions paired to their champion live rows. */
function buildShadowPairs(challengerVersion: number): PairedSample[] {
  const shadows = db
    .select()
    .from(tables.shadowPredictions)
    .where(
      and(
        eq(tables.shadowPredictions.strategyVersion, challengerVersion),
        isNotNull(tables.shadowPredictions.directionCorrect),
        isNotNull(tables.shadowPredictions.pairedPredictionId),
      ),
    )
    .all();

  const pairs: PairedSample[] = [];
  for (const sh of shadows) {
    const champOutcome = db
      .select()
      .from(tables.predictionOutcomes)
      .where(eq(tables.predictionOutcomes.predictionId, sh.pairedPredictionId!))
      .limit(1)
      .all()[0];
    const champ = db
      .select()
      .from(tables.predictions)
      .where(eq(tables.predictions.id, sh.pairedPredictionId!))
      .limit(1)
      .all()[0];
    if (!champOutcome || !champ) continue;
    pairs.push({
      championCorrect: champOutcome.directionCorrect,
      challengerCorrect: sh.directionCorrect!,
      championOutlook: champ.outlook,
      challengerOutlook: sh.outlook,
      returnPct: sh.returnPct ?? 0,
      championConfidence: champ.confidence,
      challengerConfidence: sh.confidence,
      regime: sh.regime,
    });
  }
  return pairs;
}

export interface ChallengerEvaluation {
  version: number;
  tier: "quant" | "full" | "both";
  scorecard: Scorecard;
  promoted: boolean;
  reason: string;
}

function promotionsThisQuarter(): number {
  const quarterStart = Date.now() - 90 * 86_400_000;
  return db
    .select({ version: tables.strategyVersions.version })
    .from(tables.strategyVersions)
    .where(and(eq(tables.strategyVersions.status, "active"), gte(tables.strategyVersions.activatedAt, quarterStart)))
    .all().length;
}

/** Score the current challenger and auto-promote if it passes. */
export function evaluateChallenger(): ChallengerEvaluation | null {
  const challenger = db
    .select()
    .from(tables.strategyVersions)
    .where(eq(tables.strategyVersions.status, "testing"))
    .orderBy(desc(tables.strategyVersions.version))
    .limit(1)
    .all()[0];
  if (!challenger) return null;

  const minPairs = challenger.tier === "quant" ? MIN_PAIRS_QUANT : MIN_PAIRS_FULL;
  const pairs =
    challenger.tier === "full" ? buildShadowPairs(challenger.version) : buildQuantPairs(challenger.version);
  const scorecard = computeScorecard(pairs, minPairs);

  // Persist the scorecard so the UI can show progress even before promotion.
  db.update(tables.strategyVersions)
    .set({ scorecard })
    .where(eq(tables.strategyVersions.version, challenger.version))
    .run();

  if (!scorecard.passed) {
    return { version: challenger.version, tier: challenger.tier, scorecard, promoted: false, reason: scorecard.verdict };
  }
  if (promotionsThisQuarter() >= MAX_PROMOTIONS_PER_QUARTER) {
    return {
      version: challenger.version,
      tier: challenger.tier,
      scorecard,
      promoted: false,
      reason: "quarterly promotion cap reached",
    };
  }

  promoteVersion(challenger.version);
  return { version: challenger.version, tier: challenger.tier, scorecard, promoted: true, reason: "passed the gauntlet" };
}

export function promoteVersion(version: number): void {
  const now = Date.now();
  db.transaction((tx) => {
    // Retire the current champion.
    tx.update(tables.strategyVersions)
      .set({ status: "retired", retiredAt: now })
      .where(eq(tables.strategyVersions.status, "active"))
      .run();
    // Activate the challenger.
    tx.update(tables.strategyVersions)
      .set({ status: "active", activatedAt: now })
      .where(eq(tables.strategyVersions.version, version))
      .run();
  });
  console.log(`[controller] promoted strategy v${version} to active`);
}

/** Trailing live win rate for a version over its graded predictions. */
function liveWinRate(version: number): { winRate: number; graded: number } {
  const rows = db
    .select({ directionCorrect: tables.predictionOutcomes.directionCorrect })
    .from(tables.predictionOutcomes)
    .innerJoin(tables.predictions, eq(tables.predictionOutcomes.predictionId, tables.predictions.id))
    .where(and(eq(tables.predictions.algoVersion, version), eq(tables.predictions.status, "ok")))
    .all();
  if (rows.length === 0) return { winRate: 0, graded: 0 };
  return { winRate: rows.filter((r) => r.directionCorrect).length / rows.length, graded: rows.length };
}

export interface RollbackResult {
  rolledBack: boolean;
  reason: string;
}

/** Auto-rollback a promoted version that trails its parent's live win rate
 * by more than 10 points after >=30 graded live calls. */
export function checkRollback(): RollbackResult {
  const active = db
    .select()
    .from(tables.strategyVersions)
    .where(eq(tables.strategyVersions.status, "active"))
    .orderBy(desc(tables.strategyVersions.version))
    .limit(1)
    .all()[0];
  if (!active || active.parentVersion == null) {
    return { rolledBack: false, reason: "no active version with a parent" };
  }

  const activeStats = liveWinRate(active.version);
  if (activeStats.graded < ROLLBACK_MIN_LIVE) {
    return { rolledBack: false, reason: `only ${activeStats.graded} graded live calls (need ${ROLLBACK_MIN_LIVE})` };
  }
  const parent = getStrategyVersion(active.parentVersion);
  if (!parent) return { rolledBack: false, reason: "parent version missing" };
  const parentStats = liveWinRate(parent.version);

  const trailPoints = (parentStats.winRate - activeStats.winRate) * 100;
  if (trailPoints > ROLLBACK_TRAIL_POINTS) {
    const now = Date.now();
    db.transaction((tx) => {
      tx.update(tables.strategyVersions)
        .set({ status: "retired", retiredAt: now })
        .where(eq(tables.strategyVersions.version, active.version))
        .run();
      tx.update(tables.strategyVersions)
        .set({ status: "active", activatedAt: now, retiredAt: null })
        .where(eq(tables.strategyVersions.version, parent.version))
        .run();
    });
    console.log(`[controller] rolled back v${active.version} → v${parent.version} (trailed ${trailPoints.toFixed(0)}pt)`);
    return {
      rolledBack: true,
      reason: `v${active.version} trailed v${parent.version} by ${trailPoints.toFixed(0)} points over ${activeStats.graded} calls`,
    };
  }
  return { rolledBack: false, reason: `active version is within tolerance (trails ${trailPoints.toFixed(0)}pt)` };
}

export {
  MIN_PAIRS_QUANT,
  MIN_PAIRS_FULL,
  MAX_PROMOTIONS_PER_QUARTER,
  ROLLBACK_TRAIL_POINTS,
  ROLLBACK_MIN_LIVE,
};
