import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs";

const schema = z.object({
  symbol: z.string().trim().min(1).max(12).transform((s) => s.toUpperCase()),
});

/** Enqueue a research job; the worker runs it (30-120s). Never inline. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const job = enqueueJob("research", { symbol: parsed.data.symbol });
  return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
}
