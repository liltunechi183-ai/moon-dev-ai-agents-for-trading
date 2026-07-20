import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, tables } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = db
    .select()
    .from(tables.botActivity)
    .orderBy(desc(tables.botActivity.ts))
    .limit(100)
    .all();
  return NextResponse.json(rows);
}
