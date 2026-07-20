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
import { deservesPostmortem } from "@/lib/research/postmortem";
import { enqueueJob } from "@/lib/jobs";
import { renderQuantBullets } from "@/lib/research/packet";
import type { Bar } from "@/lib/quant/types";

const DAY_MS = 86_400_000;

async function fetchBarsCovering(symbol: string, sinceTs: number): Promise<Bar[]> {
  const daysBack = Math.ceil((Date.now() - sinceTs) / DAY_MS) + 40;
  const bars = await getDailyBars(symbol, Math.max(daysBack, 60));
  cacheDailyBars(symbol, bars);
  return bars;
}

/** Grade every matured, ungraded prediction + enqueue post-mortems. */
export async function gradeMaturedPredictions(): Promise<number> {
  const now = Date.now();
  const candidates = db
    .select({
      id: tables.predictions.id,
      symbol: tables.predictions.symbol,
      createdAt: tables.predictions.createdAt,
      outlook: tables.predictions.outlook,
      confidence: tables.predictions.confidence,
      horizonDays: tables.predictions.horizonDays,
      quantSnapshot: tables.predictions.quantSnapshot,
    })
    .from(tables.predictions)
    .leftJoin(tables.predictionOutcomes, eq(tables.predictions.id, tables.predictionOutcomes.predictionId))
    .where(and(eq(tables.predictions.status, "ok"), isNull(tables.predictionOutcomes.predictionId)))
    .all()
    .filter((p) => p.createdAt + p.horizonDays * DAY_MS <= now);

  if (candidates.length === 0) return 0;

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
      if (!window) continue; // horizon not covered yet — try tomorrow

      const atrPct = p.quantSnapshot?.indicators?.atrPct ?? null;
      const band = neutralBandFor(atrPct, p.horizonDays);
      const path = computePathStats(window.entryPrice, window.pathCloses);
      const benchmark = spyBars.length ? extractGradingWindow(spyBars, p.createdAt, horizonTs) : null;
      const directionCorrect = gradeDirection(p.outlook, window.returnPct, band);

      db.insert(tables.predictionOutcomes)
        .values({
          predictionId: p.id,
          evaluatedAt: now,
          priceAtPrediction: window.entryPrice,
          priceAtHorizon: window.horizonPrice,
          returnPct: window.returnPct,
          directionCorrect,
          maxDrawdownPct: path.maxDrawdownPct,
          maxGainPct: path.maxGainPct,
          neutralBandPct: band,
          benchmarkReturnPct: benchmark?.returnPct ?? null,
        })
        .onConflictDoNothing()
        .run();
      graded++;

      if (deservesPostmortem(directionCorrect, p.confidence)) {
        enqueueJob("postmortem", { source: "live", predictionId: p.id });
      }
    } catch (err) {
      console.error(`[outcome-runner] grading failed for ${p.symbol} (prediction ${p.id}):`, err);
    }
  }

  if (graded > 0) console.log(`[outcome-runner] graded ${graded} prediction(s)`);
  return graded;
}

/** Grade matured shadow predictions in place. */
export async function gradeMaturedShadows(): Promise<number> {
  const now = Date.now();
  const candidates = db
    .select()
    .from(tables.shadowPredictions)
    .where(isNull(tables.shadowPredictions.evaluatedAt))
    .all()
    .filter((s) => s.createdAt + s.horizonDays * DAY_MS <= now);

  if (candidates.length === 0) return 0;

  const oldestEntry = Math.min(...candidates.map((c) => c.createdAt));
  let spyBars: Bar[] = [];
  try {
    spyBars = await fetchBarsCovering("SPY", oldestEntry);
  } catch {
    // benchmark optional
  }

  let graded = 0;
  const barsCache = new Map<string, Bar[]>();
  for (const s of candidates) {
    try {
      let bars = barsCache.get(s.symbol);
      if (!bars) {
        bars = await fetchBarsCovering(s.symbol, s.createdAt);
        barsCache.set(s.symbol, bars);
      }
      const horizonTs = s.createdAt + s.horizonDays * DAY_MS;
      const window = extractGradingWindow(bars, s.createdAt, horizonTs);
      if (!window) continue;

      // Reuse the paired champion's ATR for the band when available.
      const band = neutralBandFor(null, s.horizonDays);
      const path = computePathStats(window.entryPrice, window.pathCloses);
      const benchmark = spyBars.length ? extractGradingWindow(spyBars, s.createdAt, horizonTs) : null;

      db.update(tables.shadowPredictions)
        .set({
          evaluatedAt: now,
          priceAtPrediction: window.entryPrice,
          priceAtHorizon: window.horizonPrice,
          returnPct: window.returnPct,
          directionCorrect: gradeDirection(s.outlook, window.returnPct, band),
          maxDrawdownPct: path.maxDrawdownPct,
          maxGainPct: path.maxGainPct,
          neutralBandPct: band,
          benchmarkReturnPct: benchmark?.returnPct ?? null,
        })
        .where(eq(tables.shadowPredictions.id, s.id))
        .run();
      graded++;
    } catch (err) {
      console.error(`[outcome-runner] shadow grading failed for ${s.symbol} (${s.id}):`, err);
    }
  }
  if (graded > 0) console.log(`[outcome-runner] graded ${graded} shadow prediction(s)`);
  return graded;
}

async function runAllGrading(): Promise<void> {
  await gradeMaturedPredictions();
  await gradeMaturedShadows();
}

export function startOutcomeRunner(): void {
  cron.schedule(
    "30 18 * * 1-5",
    () => {
      runAllGrading().catch((err) => console.error("[outcome-runner] failed:", err));
    },
    { timezone: "America/New_York" },
  );

  setTimeout(() => {
    runAllGrading().catch((err) => console.error("[outcome-runner] boot pass failed:", err));
  }, 30_000);
}

/** Exposed for the postmortem job handler to build its quant summary. */
export function quantSummaryFor(
  quantSnapshot: { indicators: import("@/lib/quant/types").IndicatorSnapshot; patterns: import("@/lib/quant/patterns").Pattern[] } | null,
): string {
  if (!quantSnapshot) return "No technical snapshot was stored.";
  return renderQuantBullets(quantSnapshot.indicators, quantSnapshot.patterns);
}
