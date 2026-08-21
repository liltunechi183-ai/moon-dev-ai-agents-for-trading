import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { runAnalysis } from "@/lib/research/agent";
import { getActiveStrategy, listStrategyVersions } from "@/lib/research/strategy";
import { computeAccuracy, loadGradedRows } from "@/lib/research/accuracy";
import { checkStrategistGate, validateProposal, type LessonCluster } from "./strategist";
import { REASONING_MODEL } from "@/lib/models";

export const STRATEGIST_MODEL = REASONING_MODEL;

function loadLessonClusters(): { clusters: LessonCluster[]; total: number } {
  const lessons = db.select().from(tables.lessons).all();
  const byCause = new Map<string, LessonCluster>();
  for (const l of lessons) {
    if (!byCause.has(l.rootCause)) {
      byCause.set(l.rootCause, { rootCause: l.rootCause, count: 0, regimes: new Set() });
    }
    const c = byCause.get(l.rootCause)!;
    c.count++;
    if (l.regime) c.regimes.add(l.regime);
  }
  return { clusters: [...byCause.values()], total: lessons.length };
}

function renderLineage(): string {
  return listStrategyVersions()
    .map(
      (v) =>
        `v${v.version} [${v.status}] parent=${v.parentVersion ?? "none"} — ${v.changeSummary}${
          v.status === "rejected" || v.status === "retired"
            ? ` (this one did not stick — do not re-propose it)`
            : ""
        }`,
    )
    .join("\n");
}

const STRATEGIST_SYSTEM = `You are a quantitative research director improving a stock-prediction
strategy. You propose EXACTLY ONE bounded, measurable change at a time, with
a falsifiable expected effect. You never rewrite the whole playbook — you
change one specific thing and explain why the evidence demands it.

You are given the active strategy (two bodies: a full analyst version and a
technicals-only quant version), the measured accuracy overall and by regime,
the clustered lessons from graded mistakes, and the full version lineage
including rejected/rolled-back attempts (do NOT re-propose those).

Output ONLY a JSON object:
{
  "tier": "quant" | "full" | "both",
  "changeSummary": "one sentence naming the single change and its falsifiable expected effect",
  "rationale": "2-4 sentences citing the lesson cluster and accuracy numbers that justify it",
  "fullText": "the COMPLETE new full-analyst strategy body (unchanged if tier=quant — byte-identical to the current one)",
  "quantText": "the COMPLETE new quant strategy body (unchanged if tier=full — byte-identical to the current one)"
}

Rules: change ONLY the tier you declare; the other tier's text must be
byte-identical to the current one. Keep each changed body within 0.6-1.7x
its current length — a targeted edit, not a rewrite.`;

export interface StrategistResult {
  proposed: boolean;
  reason: string;
  version?: number;
}

function parseProposal(text: string): {
  tier: "quant" | "full" | "both";
  changeSummary: string;
  rationale: string;
  fullText: string;
  quantText: string;
} | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1));
    if (!["quant", "full", "both"].includes(raw.tier)) return null;
    if (typeof raw.changeSummary !== "string" || typeof raw.rationale !== "string") return null;
    if (typeof raw.fullText !== "string" || typeof raw.quantText !== "string") return null;
    return raw;
  } catch {
    return null;
  }
}

/** Weekly strategist run: gate hard, then ask for ONE bounded change. */
export async function runStrategist(): Promise<StrategistResult> {
  const active = getActiveStrategy();

  const challengerTesting =
    db.select().from(tables.strategyVersions).where(eq(tables.strategyVersions.status, "testing")).all().length > 0;
  const unprocessedProposal =
    db.select().from(tables.strategyVersions).where(eq(tables.strategyVersions.status, "proposed")).all().length > 0;
  const { clusters, total } = loadLessonClusters();

  const gate = checkStrategistGate({
    challengerAlreadyTesting: challengerTesting,
    unprocessedProposal,
    lessonCount: total,
    clusters,
  });
  if (!gate.ok) {
    console.log(`[strategist] skipping: ${gate.reason}`);
    return { proposed: false, reason: gate.reason };
  }

  const accuracy = computeAccuracy(loadGradedRows());
  const clusterText = clusters
    .map((c) => `- ${c.rootCause}: ${c.count} times, regimes: ${[...c.regimes].join(", ") || "n/a"}`)
    .join("\n");
  const regimeText = accuracy.byRegime.map((b) => `- ${b.label}: ${(b.winRate * 100).toFixed(0)}% (n=${b.samples})`).join("\n");

  const prompt = `## Current active strategy (v${active.version})

### Full analyst body
${active.fullText}

### Quant-only body
${active.quantText}

## Measured accuracy
Overall win rate: ${accuracy.winRate !== null ? (accuracy.winRate * 100).toFixed(0) + "%" : "n/a"} over ${accuracy.graded} graded calls.
By regime:
${regimeText || "(not enough per-regime data)"}

## Lesson clusters (from graded mistakes)
${clusterText}

## Version lineage
${renderLineage()}

Propose exactly ONE bounded change now. Output ONLY the JSON.`;

  const run = await runAnalysis(prompt, {
    systemPrompt: STRATEGIST_SYSTEM,
    model: STRATEGIST_MODEL,
    allowedTools: [],
    maxTurns: 1,
  });

  const proposal = parseProposal(run.resultText);
  if (!proposal) {
    console.warn("[strategist] produced no parseable proposal");
    return { proposed: false, reason: "no parseable proposal" };
  }

  const validation = validateProposal({
    parentFullText: active.fullText,
    parentQuantText: active.quantText,
    proposedFullText: proposal.fullText,
    proposedQuantText: proposal.quantText,
    tier: proposal.tier,
    changeSummary: proposal.changeSummary,
  });
  if (!validation.ok) {
    console.warn(`[strategist] proposal rejected: ${validation.reason}`);
    return { proposed: false, reason: `invalid proposal: ${validation.reason}` };
  }

  const nextVersion = (listStrategyVersions()[0]?.version ?? active.version) + 1;
  db.insert(tables.strategyVersions)
    .values({
      version: nextVersion,
      parentVersion: active.version,
      fullText: proposal.fullText,
      quantText: proposal.quantText,
      changeSummary: proposal.changeSummary,
      rationale: proposal.rationale,
      tier: proposal.tier,
      status: "testing",
      createdBy: "strategist",
      createdAt: Date.now(),
    })
    .run();

  console.log(`[strategist] proposed v${nextVersion} into testing: ${proposal.changeSummary}`);
  return { proposed: true, reason: proposal.changeSummary, version: nextVersion };
}
