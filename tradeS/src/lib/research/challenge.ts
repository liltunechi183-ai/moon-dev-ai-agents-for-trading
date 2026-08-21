import { asc, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { buildResearchPacket } from "./packet";
import { runAnalysis } from "./agent";
import { parsePrediction } from "./schema";
import { buildTrackRecord, effectiveConfidence } from "./calibration";
import { getActiveStrategy, renderFullStrategy } from "./strategy";
import { getCurrentRegime } from "./regime";
import { REASONING_MODEL } from "@/lib/models";

export const CHALLENGE_MODEL = REASONING_MODEL;

const CHALLENGE_SYSTEM = `You are the research analyst whose stock prediction is being challenged by
the user. Argue honestly, not defensively.

Rules of engagement:
- VERIFY claims with real numbers (use WebSearch/WebFetch) before arguing.
- If the user is right, CONCEDE explicitly and say what changes.
- If the user's numbers are wrong, correct them with a source.
- Distinguish "the fact is true" from "the fact breaks the thesis" — many
  true facts don't change the call.
- Reply in the user's language, in plain prose a middle-schooler could
  follow, under ~300 words, no markdown headers.
- This is decision-support research, not financial advice.

REVISION PROTOCOL: if — and only if — this exchange materially changes
your view (outlook flips, or confidence moves by 2 or more), append at the
very end, on its own line:
REVISED_VERDICT: {"outlook":...,"confidence":...,"horizonDays":...,"thesis":...,"risks":[...],"catalysts":[...],"sources":[...]}
The JSON must be a complete valid prediction object in English (same schema
as your original). If your view does not materially change, do NOT emit
REVISED_VERDICT at all.`;

export interface ChallengeResult {
  reply: string;
  revisedPredictionId: number | null;
}

/** Extract the REVISED_VERDICT payload (if any) and the visible reply. */
export function splitRevision(text: string): { reply: string; revisionJson: string | null } {
  const marker = "REVISED_VERDICT:";
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return { reply: text.trim(), revisionJson: null };
  return {
    reply: text.slice(0, idx).trim(),
    revisionJson: text.slice(idx + marker.length).trim(),
  };
}

export async function runChallenge(predictionId: number): Promise<ChallengeResult> {
  const [prediction] = db
    .select()
    .from(tables.predictions)
    .where(eq(tables.predictions.id, predictionId))
    .limit(1)
    .all();
  if (!prediction) throw new Error(`prediction ${predictionId} not found`);

  const thread = db
    .select()
    .from(tables.chatMessages)
    .where(eq(tables.chatMessages.predictionId, predictionId))
    .orderBy(asc(tables.chatMessages.createdAt))
    .all();

  const packet = await buildResearchPacket(prediction.symbol);
  const strategy = getActiveStrategy();
  const trackRecord = buildTrackRecord();
  const cal = effectiveConfidence(prediction.outlook, prediction.confidence);

  const threadText = thread
    .map((m) => `${m.role === "user" ? "USER" : "ANALYST"}: ${m.content}`)
    .join("\n\n");

  const prompt = `## Your original prediction (${prediction.symbol})

Outlook: ${prediction.outlook}, confidence ${prediction.confidence}/10 (calibrated: ${cal.effective}), horizon ${prediction.horizonDays} days.
Thesis: ${prediction.thesis}
Risks: ${prediction.risks.join("; ")}

## Your strategy

${renderFullStrategy(strategy)}

${trackRecord ? `## Your measured track record\n\n${trackRecord}\n` : ""}
## Fresh research packet (rebuilt just now)

${packet.markdown}

## The challenge conversation so far

${threadText}

Respond to the user's latest message following your rules of engagement.
Verify before arguing. Concede when they're right.`;

  const run = await runAnalysis(prompt, {
    systemPrompt: CHALLENGE_SYSTEM,
    model: CHALLENGE_MODEL,
    allowedTools: ["WebSearch", "WebFetch"],
    maxTurns: 20,
  });

  const { reply, revisionJson } = splitRevision(run.resultText);
  let revisedPredictionId: number | null = null;

  if (revisionJson) {
    const parsed = parsePrediction(revisionJson);
    if (parsed.ok) {
      const regime = await getCurrentRegime();
      const [row] = db
        .insert(tables.predictions)
        .values({
          symbol: prediction.symbol,
          createdAt: Date.now(),
          ...parsed.prediction,
          quantSnapshot: packet.quantSnapshot,
          model: run.model,
          durationMs: run.durationMs,
          status: "ok",
          revisedFromId: prediction.id, // old row is kept and still graded
          algoVersion: strategy.version,
          regime,
        })
        .returning()
        .all();
      revisedPredictionId = row.id;
    } else {
      console.warn("[challenge] REVISED_VERDICT failed validation — ignored:", parsed.error);
    }
  }

  db.insert(tables.chatMessages)
    .values({ predictionId, role: "assistant", content: reply, createdAt: Date.now() })
    .run();

  return { reply, revisedPredictionId };
}
