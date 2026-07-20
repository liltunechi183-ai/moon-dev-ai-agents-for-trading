import { z } from "zod";

// The analyst outputs ONLY the base language (English). Do not add
// per-language fields here — other languages come from the display-only
// translations cache, so adding a language never touches this schema.
export const PredictionSchema = z.object({
  outlook: z.enum(["bullish", "neutral", "bearish"]),
  confidence: z.number().int().min(0).max(10),
  horizonDays: z.number().int().min(1).max(365),
  thesis: z.string().min(50),
  risks: z.array(z.string()).min(1).max(8),
  catalysts: z.array(z.string()).min(0).max(8),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).min(0).max(15),
});

export type Prediction = z.infer<typeof PredictionSchema>;

/**
 * Strip markdown fences and take the outermost {...} from a model answer.
 * Returns null when no braces are found.
 */
export function extractJson(text: string): string | null {
  const withoutFences = text.replace(/```(?:json)?/gi, "");
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return withoutFences.slice(start, end + 1);
}

export type ParseResult =
  | { ok: true; prediction: Prediction }
  | { ok: false; error: string };

export function parsePrediction(text: string): ParseResult {
  const jsonText = extractJson(text);
  if (jsonText === null) return { ok: false, error: "no JSON object found in the answer" };
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${String(err)}` };
  }
  const parsed = PredictionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  return { ok: true, prediction: parsed.data };
}
