import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { effectiveConfidence } from "@/lib/research/calibration";

export const dynamic = "force-dynamic";

/**
 * Full prediction history for one symbol, newest first, outcomes attached.
 * Calibration is attached to the newest OK row (the one the UI leads with).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();

  const rows = db
    .select()
    .from(tables.predictions)
    .leftJoin(
      tables.predictionOutcomes,
      eq(tables.predictions.id, tables.predictionOutcomes.predictionId),
    )
    .where(eq(tables.predictions.symbol, symbol))
    .orderBy(desc(tables.predictions.createdAt))
    .limit(50)
    .all();

  const latestOk = rows.find((r) => r.predictions.status === "ok")?.predictions;
  const calibration = latestOk
    ? effectiveConfidence(latestOk.outlook, latestOk.confidence)
    : null;

  return NextResponse.json({
    items: rows.map((r) => ({ prediction: r.predictions, outcome: r.prediction_outcomes })),
    calibration,
  });
}
