import { gte, sql } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import type { BudgetCounts } from "./budget";

const DAY_MS = 86_400_000;

/** Today's agent-run counts from the DB. Discovery scans are counted as
 * DISTINCT scan_id (Phase 7 populates them; 0 until then). */
export function loadBudgetCounts(): BudgetCounts {
  const dayStart = Date.now() - DAY_MS;
  const count = (rows: { id: number }[]) => rows.length;

  const predictions = count(
    db.select({ id: tables.predictions.id }).from(tables.predictions).where(gte(tables.predictions.createdAt, dayStart)).all(),
  );
  const shadows = count(
    db.select({ id: tables.shadowPredictions.id }).from(tables.shadowPredictions).where(gte(tables.shadowPredictions.createdAt, dayStart)).all(),
  );
  const backtests = count(
    db.select({ id: tables.backtests.id }).from(tables.backtests).where(gte(tables.backtests.createdAt, dayStart)).all(),
  );
  const lessons = count(
    db.select({ id: tables.lessons.id }).from(tables.lessons).where(gte(tables.lessons.createdAt, dayStart)).all(),
  );

  // Discovery scans: DISTINCT scan_id today (table added in Phase 7).
  let discoveryScans = 0;
  try {
    const rows = db.all<{ n: number }>(
      sql`SELECT COUNT(DISTINCT scan_id) as n FROM discoveries WHERE created_at >= ${dayStart}`,
    );
    discoveryScans = rows[0]?.n ?? 0;
  } catch {
    discoveryScans = 0; // table not present yet
  }

  return { predictions, shadows, backtests, lessons, discoveryScans };
}
