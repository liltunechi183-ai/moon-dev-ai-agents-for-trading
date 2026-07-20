import { db, tables } from "@/lib/db";
import { runAnalysis } from "./agent";
import { parsePrediction } from "./schema";
import { buildAnalystSystemPrompt, buildResearchPrompt, buildRetryPrompt } from "./prompts";
import { buildTrackRecord } from "./calibration";
import { getTestingVersion } from "./strategy";
import type { ResearchPacket } from "./packet";

/**
 * If a challenger strategy is in testing, answer the SAME packet with it and
 * store the answer in shadow_predictions (never in `predictions`). Paired to
 * the champion prediction from the same packet. No-op when nothing is testing.
 */
export async function runShadow(
  symbol: string,
  packet: ResearchPacket,
  pairedPredictionId: number,
  regime: string | null,
): Promise<void> {
  const challenger = getTestingVersion();
  if (!challenger) return;

  const systemPrompt = buildAnalystSystemPrompt(challenger);
  const trackRecord = buildTrackRecord();
  const prompt = buildResearchPrompt(packet.markdown, { trackRecord: trackRecord || undefined });

  const first = await runAnalysis(prompt, { systemPrompt });
  let run = first;
  let parsed = parsePrediction(first.resultText);
  if (!parsed.ok) {
    run = await runAnalysis(`${prompt}\n\n${buildRetryPrompt(parsed.error, first.resultText)}`, {
      systemPrompt,
    });
    parsed = parsePrediction(run.resultText);
  }
  if (!parsed.ok) {
    console.warn(`[shadow] ${symbol} challenger answer failed validation twice — dropped`);
    return;
  }

  db.insert(tables.shadowPredictions)
    .values({
      symbol,
      createdAt: Date.now(),
      strategyVersion: challenger.version,
      pairedPredictionId,
      outlook: parsed.prediction.outlook,
      confidence: parsed.prediction.confidence,
      horizonDays: parsed.prediction.horizonDays,
      thesis: parsed.prediction.thesis,
      model: run.model,
      regime,
    })
    .run();
}
