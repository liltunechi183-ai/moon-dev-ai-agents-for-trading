import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db, tables } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = db
    .select()
    .from(tables.accountSnapshots)
    .orderBy(asc(tables.accountSnapshots.ts))
    .all();
  return NextResponse.json(rows);
}
