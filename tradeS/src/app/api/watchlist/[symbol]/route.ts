import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  db.delete(tables.watchlist).where(eq(tables.watchlist.symbol, symbol.toUpperCase())).run();
  return NextResponse.json({ ok: true });
}
