import { NextResponse } from "next/server";
import { enqueueJob } from "@/lib/jobs";

/** Scan now: enqueue with a constant {} payload so enqueueJob's dedup makes a
 * double-click return the same running job. */
export async function POST() {
  const job = enqueueJob("discovery", {});
  return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
}
