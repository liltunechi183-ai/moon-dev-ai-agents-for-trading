import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  db.delete(tables.holdings).where(eq(tables.holdings.id, idNum)).run();
  return NextResponse.json({ ok: true });
}
