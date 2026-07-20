import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";

const schema = z.object({ action: z.enum(["approve", "dismiss"]) });

/** Approve → watchlist insert (onConflictDoNothing) + immediate research job
 * + status flip. Dismiss → status flip only. Both still get graded later. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNum = Number(id);
  const parsed = schema.safeParse(await request.json());
  if (!Number.isInteger(idNum) || !parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const [discovery] = db
    .select()
    .from(tables.discoveries)
    .where(eq(tables.discoveries.id, idNum))
    .limit(1)
    .all();
  if (!discovery) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (discovery.status !== "pending") {
    return NextResponse.json({ error: "already resolved" }, { status: 409 });
  }

  const now = Date.now();
  if (parsed.data.action === "approve") {
    db.insert(tables.watchlist)
      .values({ symbol: discovery.symbol, addedAt: now })
      .onConflictDoNothing()
      .run();
    db.update(tables.discoveries)
      .set({ status: "approved", resolvedAt: now })
      .where(eq(tables.discoveries.id, idNum))
      .run();
    enqueueJob("research", { symbol: discovery.symbol });
    return NextResponse.json({ ok: true, tracked: discovery.symbol });
  }

  db.update(tables.discoveries)
    .set({ status: "dismissed", resolvedAt: now })
    .where(eq(tables.discoveries.id, idNum))
    .run();
  return NextResponse.json({ ok: true });
}
