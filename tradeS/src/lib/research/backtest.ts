import { db, tables } from "@/lib/db";
import { getDailyBars } from "@/lib/yahoo/quotes";
import { buildQuantPayload } from "@/lib/quant/snapshot";
import { renderQuantBullets } from "./packet";
import { runAnalysis, ANALYST_MODEL } from "./agent";
import { parsePrediction } from "./schema";
import { buildQuantAnalystSystemPrompt, buildRetryPrompt } from "./prompts";
import { getActiveStrategy, type StrategyVersion } from "./strategy";
import { extractGradingWindow, computePathStats, gradeDirection, neutralBandFor } from "./grading";
import { regimeAtIndex } from "./regime";
import { getTrackedSymbols } from "@/lib/tracked";
import { isUsTicker } from "@/lib/alpaca/symbols";
import type { Bar } from "@/lib/quant/types";

const DAY_MS = 86_400_000;
const MIN_HISTORY_BARS = 260; // enough for SMA200 + 52w stats
const MIN_FUTURE_BARS = 70; // room to grade up to ~90 calendar days

const FALLBACK_UNIVERSE = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "JPM", "XOM", "JNJ", "COST"];

export function pickSimSymbol(): string {
  const tracked = getTrackedSymbols().filter(isUsTicker);
  const universe = tracked.length > 0 ? tracked : FALLBACK_UNIVERSE;
  return universe[Math.floor(Math.random() * universe.length)];
}

export type BacktestRow = typeof tables.backtests.$inferSelect;

/**
 * One point-in-time sim: pick a random past date, truncate bars there,
 * ask the quant-only analyst (NO web tools), grade against what actually
 * happened. Returns null when the symbol lacks enough history.
 */
export async function runSim(
  symbol: string,
  opts: { strategy?: StrategyVersion; model?: string } = {},
): Promise<BacktestRow | null> {
  const strategy = opts.strategy ?? getActiveStrategy();
  const bars = await getDailyBars(symbol, 900);
  if (bars.length < MIN_HISTORY_BARS + MIN_FUTURE_BARS + 10) return null;

  const minIdx = MIN_HISTORY_BARS;
  const maxIdx = bars.length - 1 - MIN_FUTURE_BARS;
  const asOfIdx = minIdx + Math.floor(Math.random() * (maxIdx - minIdx + 1));
  const truncated = bars.slice(0, asOfIdx + 1);
  const asOf = truncated[truncated.length - 1].ts;

  const quantSnapshot = buildQuantPayload(truncated);
  const packet = `# Technical snapshot (point-in-time, dates withheld)

${renderQuantBullets(quantSnapshot.indicators, quantSnapshot.patterns)}

Judge this setup now. Output ONLY the JSON object described in your instructions.`;

  const systemPrompt = buildQuantAnalystSystemPrompt(strategy);
  const first = await runAnalysis(packet, {
    systemPrompt,
    model: opts.model ?? ANALYST_MODEL,
    allowedTools: [], // zero leak: no web, no files
    maxTurns: 1,
  });
  let run = first;
  let parsed = parsePrediction(first.resultText);
  if (!parsed.ok) {
    run = await runAnalysis(`${packet}\n\n${buildRetryPrompt(parsed.error, first.resultText)}`, {
      systemPrompt,
      model: opts.model ?? ANALYST_MODEL,
      allowedTools: [],
      maxTurns: 1,
    });
    parsed = parsePrediction(run.resultText);
  }
  if (!parsed.ok) {
    console.warn(`[backtest] ${symbol} sim failed validation twice — dropped`);
    return null;
  }

  const p = parsed.prediction;
  const horizonTs = asOf + p.horizonDays * DAY_MS;
  const window = extractGradingWindow(bars, asOf, horizonTs);
  if (!window) return null; // horizon fell off the end — rare, just drop

  const band = neutralBandFor(quantSnapshot.indicators.atrPct, p.horizonDays);
  const path = computePathStats(window.entryPrice, window.pathCloses);

  let benchmarkReturnPct: number | null = null;
  let regime: string | null = null;
  try {
    const spyBars: Bar[] = await getDailyBars("SPY", 900);
    benchmarkReturnPct = extractGradingWindow(spyBars, asOf, horizonTs)?.returnPct ?? null;
    const spyIdx = spyBars.findIndex((b) => b.ts >= asOf);
    if (spyIdx > 0) {
      let vixAt: number | null = null;
      try {
        const vixBars = await getDailyBars("^VIX", 900);
        vixAt = [...vixBars].reverse().find((b) => b.ts <= asOf)?.close ?? null;
      } catch {
        vixAt = null;
      }
      regime = regimeAtIndex(spyBars, spyIdx, vixAt);
    }
  } catch {
    // benchmark/regime optional
  }

  const [row] = db
    .insert(tables.backtests)
    .values({
      symbol,
      asOf,
      outlook: p.outlook,
      confidence: p.confidence,
      horizonDays: p.horizonDays,
      thesis: p.thesis,
      quantSnapshot,
      priceAtAsOf: window.entryPrice,
      priceAtHorizon: window.horizonPrice,
      returnPct: window.returnPct,
      directionCorrect: gradeDirection(p.outlook, window.returnPct, band),
      createdAt: Date.now(),
      algoVersion: strategy.version,
      model: run.model,
      regime,
      maxDrawdownPct: path.maxDrawdownPct,
      maxGainPct: path.maxGainPct,
      neutralBandPct: band,
      benchmarkReturnPct,
    })
    .returning()
    .all();
  return row;
}
