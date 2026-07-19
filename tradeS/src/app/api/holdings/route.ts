import { NextResponse } from "next/server";
import { z } from "zod";
import { db, tables } from "@/lib/db";

export async function GET() {
  const rows = db.select().from(tables.holdings).all();
  return NextResponse.json(rows);
}

const createSchema = z.object({
  symbol: z.string().trim().min(1).max(12).transform((s) => s.toUpperCase()),
  shares: z.number().positive(),
  costBasis: z.number().positive(),
  acquiredAt: z.number().int().optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const now = Date.now();
  const [row] = db
    .insert(tables.holdings)
    .values({ ...parsed.data, createdAt: now, updatedAt: now })
    .returning()
    .all();
  return NextResponse.json(row, { status: 201 });
}
