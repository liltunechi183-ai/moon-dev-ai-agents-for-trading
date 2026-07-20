import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { getTrackedSymbols } from "@/lib/tracked";
import { effectiveConfidence } from "@/lib/research/calibration";

export const dynamic = "force-dynamic";

/** Latest prediction per tracked symbol, with calibration info attached. */
export async function GET() {
  const symbols = getTrackedSymbols();
  const items = symbols.map((symbol) => {
    const [latest] = db
      .select()
      .from(tables.predictions)
      .where(eq(tables.predictions.symbol, symbol))
      .orderBy(desc(tables.predictions.createdAt))
      .limit(1)
      .all();

    if (!latest) return { symbol, prediction: null, calibration: null };

    const calibration =
      latest.status === "ok"
        ? effectiveConfidence(latest.outlook, latest.confidence)
        : null;

    const outcome = db
      .select()
      .from(tables.predictionOutcomes)
      .where(eq(tables.predictionOutcomes.predictionId, latest.id))
      .limit(1)
      .all()[0];

    return { symbol, prediction: latest, calibration, outcome: outcome ?? null };
  });

  // Data-first, then alphabetical.
  items.sort((a, b) => {
    if (!!a.prediction !== !!b.prediction) return a.prediction ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });

  return NextResponse.json(items);
}
