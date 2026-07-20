import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = db
    .select()
    .from(tables.ruleSuggestions)
    .where(eq(tables.ruleSuggestions.status, "pending"))
    .orderBy(desc(tables.ruleSuggestions.createdAt))
    .all();
  return NextResponse.json(rows);
}
