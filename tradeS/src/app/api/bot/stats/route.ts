import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { getRuleStats } from "@/lib/bot/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  const trades = db
    .select()
    .from(tables.botTrades)
    .orderBy(desc(tables.botTrades.exitAt))
    .limit(50)
    .all();
  return NextResponse.json({ ruleStats: getRuleStats(), recentTrades: trades });
}
