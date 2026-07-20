import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, tables } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = db
    .select({
      id: tables.lessons.id,
      symbol: tables.lessons.symbol,
      rootCause: tables.lessons.rootCause,
      evidence: tables.lessons.evidence,
      ruleOfThumb: tables.lessons.ruleOfThumb,
      regime: tables.lessons.regime,
      source: tables.lessons.source,
      createdAt: tables.lessons.createdAt,
    })
    .from(tables.lessons)
    .orderBy(desc(tables.lessons.createdAt))
    .limit(30)
    .all();
  return NextResponse.json(rows);
}
