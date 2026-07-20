import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs";

const schema = z.object({ action: z.enum(["cycle", "resolve"]) });

/** "Speed up improvement" buttons: enqueue a cycle (force catchup) or a
 * resolve (grind the challenger to a verdict). Constant payload → dedup
 * makes a double-click return the same running job. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid action" }, { status: 400 });
  const job = enqueueJob(parsed.data.action, {});
  return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
}
