import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { listStrategyVersions, getActiveStrategy, getTestingVersion } from "@/lib/research/strategy";
import { budgetSummary } from "@/lib/improve/budget";
import { loadBudgetCounts } from "@/lib/improve/budget-counts";

export const dynamic = "force-dynamic";

function pairCount(version: number, tier: string): number {
  if (tier === "full") {
    return db
      .select({ id: tables.shadowPredictions.id })
      .from(tables.shadowPredictions)
      .where(
        and(
          eq(tables.shadowPredictions.strategyVersion, version),
          isNotNull(tables.shadowPredictions.directionCorrect),
        ),
      )
      .all().length;
  }
  return db.select({ id: tables.backtests.id }).from(tables.backtests).where(eq(tables.backtests.algoVersion, version)).all().length;
}

export async function GET() {
  const active = getActiveStrategy();
  const testing = getTestingVersion();
  const versions = listStrategyVersions();

  return NextResponse.json({
    active: {
      version: active.version,
      changeSummary: active.changeSummary,
      fullText: active.fullText,
      quantText: active.quantText,
    },
    testing: testing
      ? {
          version: testing.version,
          tier: testing.tier,
          changeSummary: testing.changeSummary,
          rationale: testing.rationale,
          scorecard: testing.scorecard,
          pairs: pairCount(testing.version, testing.tier),
          minPairs: testing.tier === "full" ? 20 : 60,
        }
      : null,
    timeline: versions.map((v) => ({
      version: v.version,
      parentVersion: v.parentVersion,
      status: v.status,
      tier: v.tier,
      changeSummary: v.changeSummary,
      createdBy: v.createdBy,
      createdAt: v.createdAt,
    })),
    budget: budgetSummary(loadBudgetCounts()),
  });
}
