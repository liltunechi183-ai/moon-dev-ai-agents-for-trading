import { and, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { runAnalysis } from "@/lib/research/agent";
import { getRuleStats } from "@/lib/bot/ledger";
import { RuleConditionSchema, RuleActionSchema } from "@/lib/bot/rules";

export const RULE_ADVISOR_MODEL = "claude-haiku-4-5";

const MIN_ROUND_TRIPS = 10;

const ADVISOR_SYSTEM = `You tune ONE parameter of an automated trading rule based on its realized
results. You are conservative: you suggest at most one small parameter
change, and only when the evidence clearly points to it. You never invent
new conditions — you only adjust existing numbers (minConfidence, stopLossPct,
takeProfitPct, notionalUsd, maxRsi, minRsi).

Output ONLY a JSON object:
{
  "summary": "one plain grade-6 sentence describing the change and why",
  "suggestedCondition": { ...the full condition object with your change... },
  "suggestedAction": { ...the full action object with your change... }
}

Keep every field; change only what the evidence supports. If nothing should
change, output {"summary": "no change recommended"} with no suggested objects.`;

export interface RuleAdvisorResult {
  suggestionsCreated: number;
  skipped: string[];
}

/** Weekly rule advisor: for each rule with enough realized round trips at
 * the CURRENT version, build evidence and ask for at most one tweak. Writes
 * a pending rule_suggestions row — NEVER auto-applies. */
export async function runRuleAdvisor(): Promise<RuleAdvisorResult> {
  const rules = db.select().from(tables.botRules).all();
  const stats = getRuleStats();
  let created = 0;
  const skipped: string[] = [];

  for (const rule of rules) {
    // Already a pending suggestion for this rule? One at a time.
    const pending = db
      .select({ id: tables.ruleSuggestions.id })
      .from(tables.ruleSuggestions)
      .where(and(eq(tables.ruleSuggestions.ruleId, rule.id), eq(tables.ruleSuggestions.status, "pending")))
      .all();
    if (pending.length > 0) {
      skipped.push(`rule ${rule.id}: a pending suggestion already exists`);
      continue;
    }

    const ruleStat = stats.find((s) => s.ruleId === rule.id && s.ruleVersion === rule.version);
    if (!ruleStat || ruleStat.trades < MIN_ROUND_TRIPS) {
      skipped.push(`rule ${rule.id}: only ${ruleStat?.trades ?? 0} round trips at v${rule.version} (need ${MIN_ROUND_TRIPS})`);
      continue;
    }

    const evidence = {
      trades: ruleStat.trades,
      winRate: ruleStat.winRate,
      totalPnlUsd: ruleStat.totalPnlUsd,
      avgPnlPct: ruleStat.avgPnlPct,
      byExitKind: ruleStat.byExitKind,
    };

    const prompt = `## Rule "${rule.name}" (v${rule.version})
Condition: ${JSON.stringify(rule.condition)}
Action: ${JSON.stringify(rule.action)}

## Realized performance
${JSON.stringify(evidence, null, 2)}

Suggest at most one small parameter change. Output ONLY the JSON.`;

    const run = await runAnalysis(prompt, {
      systemPrompt: ADVISOR_SYSTEM,
      model: RULE_ADVISOR_MODEL,
      allowedTools: [],
      maxTurns: 1,
    });

    const parsed = parseAdvisorOutput(run.resultText);
    if (!parsed || !parsed.suggestedCondition || !parsed.suggestedAction) {
      skipped.push(`rule ${rule.id}: no change recommended`);
      continue;
    }

    // Validate the suggested params structurally before storing.
    const condOk = RuleConditionSchema.safeParse(parsed.suggestedCondition).success;
    const actionOk = RuleActionSchema.safeParse(parsed.suggestedAction).success;
    if (!condOk || !actionOk) {
      skipped.push(`rule ${rule.id}: suggested params failed validation`);
      continue;
    }

    db.insert(tables.ruleSuggestions)
      .values({
        ruleId: rule.id,
        ruleVersion: rule.version,
        suggestedCondition: parsed.suggestedCondition,
        suggestedAction: parsed.suggestedAction,
        summary: parsed.summary,
        evidence,
        status: "pending",
        createdAt: Date.now(),
      })
      .run();
    created++;
  }

  return { suggestionsCreated: created, skipped };
}

function parseAdvisorOutput(text: string): {
  summary: string;
  suggestedCondition?: unknown;
  suggestedAction?: unknown;
} | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1));
    if (typeof raw.summary !== "string") return null;
    return raw;
  } catch {
    return null;
  }
}

export { MIN_ROUND_TRIPS };
