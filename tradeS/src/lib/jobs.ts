import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, tables } from "@/lib/db";

export type JobType = "chat" | "research" | "postmortem" | "relations" | "backtest" | "discovery" | "cycle" | "resolve";

export type JobRow = typeof tables.jobs.$inferSelect;

/**
 * Enqueue a job for the worker. Dedup: if an identical (type, payload) job is
 * already queued or running, return that job instead of stacking another —
 * this is what makes a double-clicked UI button harmless.
 */
export function enqueueJob(type: JobType, payload: Record<string, unknown>): JobRow {
  const payloadJson = JSON.stringify(payload);
  const existing = db
    .select()
    .from(tables.jobs)
    .where(
      and(
        eq(tables.jobs.type, type),
        inArray(tables.jobs.status, ["queued", "running"]),
        eq(sql`${tables.jobs.payload}`, payloadJson),
      ),
    )
    .limit(1)
    .all();
  if (existing.length > 0) return existing[0];

  const [row] = db
    .insert(tables.jobs)
    .values({ type, payload, status: "queued", createdAt: Date.now() })
    .returning()
    .all();
  return row;
}

export function getJob(id: number): JobRow | undefined {
  const [row] = db.select().from(tables.jobs).where(eq(tables.jobs.id, id)).limit(1).all();
  return row;
}

/**
 * Claim the oldest queued job whose type appears in `types`, honoring the
 * order of `types` as a strict priority list (all queued jobs of types[0]
 * before any of types[1], etc). Returns undefined when nothing is queued.
 */
export function claimNextJob(types: JobType[]): JobRow | undefined {
  for (const type of types) {
    const [row] = db
      .select()
      .from(tables.jobs)
      .where(and(eq(tables.jobs.type, type), eq(tables.jobs.status, "queued")))
      .orderBy(asc(tables.jobs.createdAt))
      .limit(1)
      .all();
    if (!row) continue;
    const updated = db
      .update(tables.jobs)
      .set({ status: "running", startedAt: Date.now() })
      .where(and(eq(tables.jobs.id, row.id), eq(tables.jobs.status, "queued")))
      .returning()
      .all();
    if (updated.length > 0) return updated[0];
  }
  return undefined;
}

export function completeJob(id: number, result: unknown): void {
  db.update(tables.jobs)
    .set({ status: "done", result, finishedAt: Date.now() })
    .where(eq(tables.jobs.id, id))
    .run();
}

export function failJob(id: number, error: unknown): void {
  db.update(tables.jobs)
    .set({ status: "error", error: String(error), finishedAt: Date.now() })
    .where(eq(tables.jobs.id, id))
    .run();
}

/**
 * A worker restart can leave jobs stuck in `running` forever. Requeue any
 * running job older than `maxAgeMs` (default 30 min) so it gets picked up
 * again. Run hourly from the worker.
 */
export function requeueStaleJobs(maxAgeMs = 30 * 60_000): number {
  const cutoff = Date.now() - maxAgeMs;
  const updated = db
    .update(tables.jobs)
    .set({ status: "queued", startedAt: null })
    .where(and(eq(tables.jobs.status, "running"), lt(tables.jobs.startedAt, cutoff)))
    .returning({ id: tables.jobs.id })
    .all();
  if (updated.length > 0) {
    console.log(`[jobs] requeued ${updated.length} stale running job(s)`);
  }
  return updated.length;
}
