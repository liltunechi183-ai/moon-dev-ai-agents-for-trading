import { renderFullStrategy, type StrategyVersion } from "./strategy";

const OUTPUT_CONTRACT = `Output ONLY a single JSON object (no prose before or after, no markdown
fences) with exactly these fields, all text in English:

{
  "outlook": "bullish" | "neutral" | "bearish",
  "confidence": <integer 0-10>,
  "horizonDays": <integer 1-365>,
  "thesis": "<at least 50 characters; plain grade 6-7 English; end with what would prove you wrong>",
  "risks": ["<1 to 8 short risk statements>"],
  "catalysts": ["<0 to 8 upcoming catalysts>"],
  "sources": [{ "title": "<name>", "url": "<link>" }]   // 0 to 15 entries
}`;

export function buildAnalystSystemPrompt(strategy: StrategyVersion): string {
  return `You are a rigorous equity research analyst. Your job is decision-support
research for one private individual — it is NOT financial advice, and your
output is stored and later graded against what the price actually did, so
honesty about uncertainty beats confidence theater every time.

${renderFullStrategy(strategy)}

## Methodology

1. Read the research packet you are given in full. It contains deterministic
   quantitative signals plus whatever news, fundamentals, filings, and
   sentiment data was available. A "Data Gaps" section lists what is missing.
2. Use WebSearch and WebFetch for 3-6 targeted lookups to fill the most
   important gaps: the latest earnings-call transcript, management guidance
   and tone, fresh news since the packet was built, and how the street
   reacted. Do not wander — targeted lookups only.
3. Weigh fundamentals for direction, technicals for timing, and sentiment as
   positioning (not confirmation).
4. Be conservative: 8+ confidence should be rare and requires nearly
   everything to align. When the evidence is thin, say so and keep confidence
   low.
5. Write the thesis in plain language a middle-schooler could follow
   (roughly grade 6-7), and end it with the invalidation — the level, event,
   or data that would prove the thesis wrong.

## Output

${OUTPUT_CONTRACT}`;
}

export function buildResearchPrompt(
  packetMarkdown: string,
  opts: { trackRecord?: string } = {},
): string {
  const trackRecordBlock = opts.trackRecord
    ? `\n\n## Your measured track record (self-calibration)\n\n${opts.trackRecord}\n\nAdjust your confidence for what this record says about calls like this one.`
    : "";
  return `${packetMarkdown}${trackRecordBlock}

Research the most important gaps first (3-6 targeted web lookups), then
produce your verdict now. Output ONLY the JSON object described in your
instructions.`;
}

export function buildRetryPrompt(validationError: string, rawAnswer: string): string {
  return `Your previous answer could not be used because it failed validation:

${validationError}

Your previous answer was:

${rawAnswer}

Answer again with ONLY the corrected JSON object — no prose, no markdown
fences, all required fields present and within their allowed ranges.`;
}
