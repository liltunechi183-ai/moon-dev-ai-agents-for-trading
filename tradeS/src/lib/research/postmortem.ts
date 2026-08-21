import { and, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { runAnalysis } from "./agent";
import { FAST_MODEL } from "@/lib/models";

export const POSTMORTEM_MODEL = FAST_MODEL;

const ROOT_CAUSES = [
  "bad-signal",
  "missed-catalyst",
  "regime-blindness",
  "overconfidence",
  "underconfidence",
  "stale-data",
  "bad-horizon",
  "crowded-trade",
  "other",
] as const;

type RootCause = (typeof ROOT_CAUSES)[number];

interface PostmortemTarget {
  source: "live" | "sim";
  predictionId?: number;
  backtestId?: number;
  symbol: string;
  regime: string | null;
  algoVersion: number | null;
  outlook: "bullish" | "neutral" | "bearish";
  confidence: number;
  returnPct: number;
  directionCorrect: boolean;
  thesis: string;
  risks?: string[];
  quantSummary: string;
}

const POSTMORTEM_SYSTEM = `You review one stock prediction after the fact. You are given the original
thesis, risks, technical snapshot, and what the price actually did. Write ONE
short lesson.

Output ONLY a JSON object:
{
  "rootCause": one of [${ROOT_CAUSES.join(", ")}],
  "evidence": "2-3 sentences citing the specific numbers that explain the miss",
  "ruleOfThumb": "one actionable line in plain English that would help next time"
}

Pick the single best-fitting root cause. Be concrete and cite the numbers.`;

function parseLesson(text: string): { rootCause: RootCause; evidence: string; ruleOfThumb: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1));
    if (!ROOT_CAUSES.includes(raw.rootCause)) return null;
    if (typeof raw.evidence !== "string" || typeof raw.ruleOfThumb !== "string") return null;
    return { rootCause: raw.rootCause, evidence: raw.evidence, ruleOfThumb: raw.ruleOfThumb };
  } catch {
    return null;
  }
}

/** Idempotent per target: a lesson already exists → skip. */
export function lessonExists(target: PostmortemTarget): boolean {
  if (target.source === "live" && target.predictionId != null) {
    return (
      db
        .select({ id: tables.lessons.id })
        .from(tables.lessons)
        .where(eq(tables.lessons.predictionId, target.predictionId))
        .limit(1)
        .all().length > 0
    );
  }
  if (target.source === "sim" && target.backtestId != null) {
    return (
      db
        .select({ id: tables.lessons.id })
        .from(tables.lessons)
        .where(eq(tables.lessons.backtestId, target.backtestId))
        .limit(1)
        .all().length > 0
    );
  }
  return false;
}

/** Run a post-mortem for one target and write a single lessons row. */
export async function runPostmortem(target: PostmortemTarget): Promise<void> {
  if (lessonExists(target)) return;

  const prompt = `## Original prediction (${target.symbol})
Outlook: ${target.outlook}, confidence ${target.confidence}/10.
Thesis: ${target.thesis}
${target.risks && target.risks.length ? `Risks named: ${target.risks.join("; ")}` : ""}
Regime at the time: ${target.regime ?? "unknown"}.

## Technical snapshot at the time
${target.quantSummary}

## What actually happened
Return over the horizon: ${target.returnPct.toFixed(1)}%. The directional call was ${target.directionCorrect ? "CORRECT" : "WRONG"}.

Write the lesson now. Output ONLY the JSON.`;

  const run = await runAnalysis(prompt, {
    systemPrompt: POSTMORTEM_SYSTEM,
    model: POSTMORTEM_MODEL,
    allowedTools: [],
    maxTurns: 1,
  });

  const lesson = parseLesson(run.resultText);
  if (!lesson) {
    console.warn(`[postmortem] ${target.symbol} produced no usable lesson`);
    return;
  }

  db.insert(tables.lessons)
    .values({
      predictionId: target.predictionId ?? null,
      backtestId: target.backtestId ?? null,
      source: target.source,
      symbol: target.symbol,
      regime: target.regime,
      algoVersion: target.algoVersion,
      outlook: target.outlook,
      confidence: target.confidence,
      returnPct: target.returnPct,
      directionCorrect: target.directionCorrect,
      rootCause: lesson.rootCause,
      evidence: lesson.evidence,
      ruleOfThumb: lesson.ruleOfThumb,
      model: run.model,
      createdAt: Date.now(),
    })
    .run();
}

/** Which graded calls deserve a post-mortem: all wrong calls, plus a sample
 * of right-but-low-confidence calls (confidence <= 3). */
export function deservesPostmortem(directionCorrect: boolean, confidence: number): boolean {
  if (!directionCorrect) return true;
  if (confidence <= 3) return Math.random() < 0.5;
  return false;
}

export type { PostmortemTarget, RootCause };
export { ROOT_CAUSES };
