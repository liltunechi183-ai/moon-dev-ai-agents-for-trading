import { NextResponse } from "next/server";
import { desc, eq, ne } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { computeDiscoveryStats, type GradedDiscovery } from "@/lib/discovery/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const pending = db
    .select()
    .from(tables.discoveries)
    .where(eq(tables.discoveries.status, "pending"))
    .orderBy(desc(tables.discoveries.createdAt))
    .all();

  const resolved = db
    .select()
    .from(tables.discoveries)
    .where(ne(tables.discoveries.status, "pending"))
    .orderBy(desc(tables.discoveries.createdAt))
    .limit(10)
    .all();

  const allForStats: GradedDiscovery[] = db
    .select({
      status: tables.discoveries.status,
      angle: tables.discoveries.angle,
      directionCorrect: tables.discoveries.directionCorrect,
      returnPct: tables.discoveries.returnPct,
      benchmarkReturnPct: tables.discoveries.benchmarkReturnPct,
    })
    .from(tables.discoveries)
    .all() as GradedDiscovery[];

  return NextResponse.json({
    pending,
    resolved,
    stats: computeDiscoveryStats(allForStats),
  });
}
