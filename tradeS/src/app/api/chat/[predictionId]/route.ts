import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ predictionId: string }> }) {
  const { predictionId } = await params;
  const idNum = Number(predictionId);
  if (!Number.isInteger(idNum)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const messages = db
    .select()
    .from(tables.chatMessages)
    .where(eq(tables.chatMessages.predictionId, idNum))
    .orderBy(asc(tables.chatMessages.createdAt))
    .all();
  return NextResponse.json(messages);
}

const postSchema = z.object({ message: z.string().trim().min(1).max(4000) });

/** Store the user message and enqueue the challenge job (runs 30-120s). */
export async function POST(request: Request, { params }: { params: Promise<{ predictionId: string }> }) {
  const { predictionId } = await params;
  const idNum = Number(predictionId);
  const parsed = postSchema.safeParse(await request.json());
  if (!Number.isInteger(idNum) || !parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const [prediction] = db
    .select({ id: tables.predictions.id })
    .from(tables.predictions)
    .where(eq(tables.predictions.id, idNum))
    .limit(1)
    .all();
  if (!prediction) return NextResponse.json({ error: "prediction not found" }, { status: 404 });

  db.insert(tables.chatMessages)
    .values({ predictionId: idNum, role: "user", content: parsed.data.message, createdAt: Date.now() })
    .run();
  const job = enqueueJob("chat", { predictionId: idNum });
  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
