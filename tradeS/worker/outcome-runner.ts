import cron from "node-cron";
import { eq, isNull, and } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { getDailyBars } from "@/lib/yahoo/quotes";
import { cacheDailyBars } from "@/lib/bars";
import {
  extractGradingWindow,
  computePathStats,
  gradeDirection,
  neutralBandFor,
} from "@/lib/research/grading";
import type { Bar } from "@/lib/quant/types";

const DAY_MS = 86_400_000;

async function fetchBarsCovering(symbol: string, sinceTs: number): Promise<Bar[]> {
  const daysBack = Math.ceil((Date.now() - sinceTs) / DAY_MS) + 40;
  const bars = await getDailyBars(symbol, Math.max(daysBack, 60));
  cacheDailyBars(symbol, bars);
  return bars;
}

/** Grade every matured, ungraded prediction. Returns how many were graded. */
export async function gradeMaturedPredictions(): Promise<number> {
  const now = Date.now();
  const candidates = db
    .select({
      id: tables.predictions.id,
      symbol: tables.predictions.symbol,
      createdAt: tables.predictions.createdAt,
      outlook: tables.predictions.outlook,
      horizonDays: tables.predictions.horizonDays,
      quantSnapshot: tables.predictions.quantSnapshot,
    })
    .from(tables.predictions)
    .leftJoin(tables.predictionOutcomes, eq(tables.predictions.id, tables.predictionOutcomes.predictionId))
    .where(and(eq(tables.predictions.status, "ok"), isNull(tables.predictionOutcomes.predictionId)))
    .all()
    .filter((p) => p.createdAt + p.horizonDays * DAY_MS <= now);

  if (candidates.length === 0) return 0;

  // One SPY series per pass for the benchmark column.
  const oldestEntry = Math.min(...candidates.map((c) => c.createdAt));
  let spyBars: Bar[] = [];
  try {
    spyBars = await fetchBarsCovering("SPY", oldestEntry);
  } catch (err) {
    console.warn("[outcome-runner] SPY benchmark unavailable this pass:", err);
  }

  let graded = 0;
  const barsCache = new Map<string, Bar[]>();

  for (const p of candidates) {
    try {
      let bars = barsCache.get(p.symbol);
      if (!bars) {
        bars = await fetchBarsCovering(p.symbol, p.createdAt);
        barsCache.set(p.symbol, bars);
      }
      const horizonTs = p.createdAt + p.horizonDays * DAY_MS;
      const window = extractGradingWindow(bars, p.createdAt, horizonTs);
      if (!window) continue; // trading days haven't covered the horizon yet — try tomorrow

      const atrPct = p.quantSnapshot?.indicators?.atrPct ?? null;
      const band = neutralBandFor(atrPct, p.horizonDays);
      const path = computePathStats(window.entryPrice, window.pathCloses);
      const benchmark = spyBars.length
        ? extractGradingWindow(spyBars, p.createdAt, horizonTs)
        : null;

      db.insert(tables.predictionOutcomes)
        .values({
          predictionId: p.id,
          evaluatedAt: now,
          priceAtPrediction: window.entryPrice,
          priceAtHorizon: window.horizonPrice,
          returnPct: window.returnPct,
          directionCorrect: gradeDirection(p.outlook, window.returnPct, band),
          maxDrawdownPct: path.maxDrawdownPct,
          maxGainPct: path.maxGainPct,
          neutralBandPct: band,
          benchmarkReturnPct: benchmark?.returnPct ?? null,
        })
        .onConflictDoNothing()
        .run();
      graded++;
    } catch (err) {
      console.error(`[outcome-runner] grading failed for ${p.symbol} (prediction ${p.id}):`, err);
    }
  }

  if (graded > 0) console.log(`[outcome-runner] graded ${graded} prediction(s)`);
  return graded;
}

export function startOutcomeRunner(): void {
  cron.schedule(
    "30 18 * * 1-5",
    () => {
      gradeMaturedPredictions().catch((err) => console.error("[outcome-runner] failed:", err));
    },
    { timezone: "America/New_York" },
  );

  // One pass shortly after boot (the laptop may have slept through the cron).
  setTimeout(() => {
    gradeMaturedPredictions().catch((err) => console.error("[outcome-runner] boot pass failed:", err));
  }, 30_000);
}
