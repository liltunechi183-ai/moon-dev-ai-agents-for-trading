import { query } from "@anthropic-ai/claude-agent-sdk";
import { db, tables } from "@/lib/db";
import { buildResearchPacket } from "./packet";
import { parsePrediction } from "./schema";
import { buildAnalystSystemPrompt, buildResearchPrompt, buildRetryPrompt } from "./prompts";
import { getActiveStrategy } from "./strategy";
import { buildTrackRecord } from "./calibration";
import { getCurrentRegime } from "./regime";

export const ANALYST_MODEL = "claude-opus-4-8";

export interface AnalysisRun {
  resultText: string;
  model: string | null;
  durationMs: number;
}

export interface RunAnalysisOptions {
  systemPrompt: string;
  model?: string;
  allowedTools?: string[];
  maxTurns?: number;
}

/**
 * One Agent SDK run. Auth comes from the machine's Claude Code login —
 * guardAnthropicKey() ran at worker boot, so the SDK cannot silently bill
 * the API. Callers run this through the jobs queue, never inline in a
 * request handler.
 */
export async function runAnalysis(prompt: string, opts: RunAnalysisOptions): Promise<AnalysisRun> {
  const startedAt = Date.now();
  let model: string | null = null;
  let resultText: string | null = null;

  const q = query({
    prompt,
    options: {
      model: opts.model ?? ANALYST_MODEL,
      systemPrompt: opts.systemPrompt,
      allowedTools: opts.allowedTools ?? ["WebSearch", "WebFetch"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: opts.maxTurns ?? 20,
      settingSources: [], // do NOT inherit user CLAUDE.md/skills/MCP
    },
  });

  for await (const message of q) {
    if (message.type === "system" && message.subtype === "init") {
      model = (message as { model?: string }).model ?? null;
    } else if (message.type === "result") {
      if (message.subtype === "success") {
        resultText = message.result;
      } else {
        throw new Error(`agent ended without result (${message.subtype})`);
      }
    }
  }

  if (resultText === null) throw new Error("agent stream ended without a result message");
  return { resultText, model, durationMs: Date.now() - startedAt };
}

export type PredictionRow = typeof tables.predictions.$inferSelect;

/**
 * The full research pipeline for one symbol: packet → analyst → validate
 * (one retry on validation failure) → insert an append-only predictions row.
 * Returns the inserted row (status "error" rows keep the raw text).
 */
export async function research(symbol: string): Promise<PredictionRow> {
  const strategy = getActiveStrategy();
  const packet = await buildResearchPacket(symbol);
  const systemPrompt = buildAnalystSystemPrompt(strategy);
  const trackRecord = buildTrackRecord();
  const prompt = buildResearchPrompt(packet.markdown, { trackRecord: trackRecord || undefined });
  const regime = await getCurrentRegime();

  const first = await runAnalysis(prompt, { systemPrompt });
  let run = first;
  let parsed = parsePrediction(first.resultText);

  if (!parsed.ok) {
    // Exactly one retry, with the validation error + prior answer appended.
    const retryPrompt = `${prompt}\n\n${buildRetryPrompt(parsed.error, first.resultText)}`;
    run = await runAnalysis(retryPrompt, { systemPrompt });
    run = { ...run, durationMs: first.durationMs + run.durationMs };
    parsed = parsePrediction(run.resultText);
  }

  const base = {
    symbol,
    createdAt: Date.now(),
    quantSnapshot: packet.quantSnapshot,
    model: run.model,
    durationMs: run.durationMs,
    algoVersion: strategy.version,
    regime,
  };

  const [row] = db
    .insert(tables.predictions)
    .values(
      parsed.ok
        ? {
            ...base,
            ...parsed.prediction,
            status: "ok" as const,
            raw: null,
          }
        : {
            ...base,
            outlook: "neutral" as const,
            confidence: 0,
            horizonDays: 30,
            thesis: `(analysis failed validation: ${parsed.error.slice(0, 300)})`,
            risks: [],
            catalysts: [],
            sources: [],
            status: "error" as const,
            raw: run.resultText,
          },
    )
    .returning()
    .all();

  return row;
}
