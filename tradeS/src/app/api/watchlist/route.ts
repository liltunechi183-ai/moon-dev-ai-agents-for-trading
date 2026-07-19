import { NextResponse } from "next/server";
import { z } from "zod";
import { db, tables } from "@/lib/db";

export async function GET() {
  const rows = db.select().from(tables.watchlist).all();
  return NextResponse.json(rows);
}

const createSchema = z.object({
  symbol: z.string().trim().min(1).max(12).transform((s) => s.toUpperCase()),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const [row] = db
    .insert(tables.watchlist)
    .values({ symbol: parsed.data.symbol, addedAt: Date.now() })
    .onConflictDoNothing()
    .returning()
    .all();
  return NextResponse.json(row ?? { symbol: parsed.data.symbol }, { status: 201 });
}
