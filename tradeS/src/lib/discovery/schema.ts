import { z } from "zod";

export const ANGLES = ["second-order", "primary-source", "commodity-chain", "dislocation"] as const;
export type Angle = (typeof ANGLES)[number];

// `sources` requires min 1 on purpose — a pick with nothing cited is unusable
// evidence for the human gate, so it fails validation and triggers the retry.
export const DiscoveryPickSchema = z.object({
  symbol: z.string().min(1).max(6),
  companyName: z.string().min(1),
  angle: z.enum(ANGLES),
  theme: z.string().min(1),
  thesis: z.string().min(80),
  whyOverlooked: z.string().min(1),
  catalysts: z.array(z.string()).min(1).max(6),
  risks: z.array(z.string()).min(1).max(6),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).min(1).max(10),
  confidence: z.number().int().min(0).max(10),
  horizonDays: z.number().int().min(14).max(120),
});

export const DiscoverySchema = z.object({
  picks: z.array(DiscoveryPickSchema).min(1).max(4),
});

export type DiscoveryPick = z.infer<typeof DiscoveryPickSchema>;
export type DiscoveryOutput = z.infer<typeof DiscoverySchema>;

/** Strip fences, take the outermost {...}, validate. */
export function parseDiscovery(text: string): { ok: true; output: DiscoveryOutput } | { ok: false; error: string } {
  const withoutFences = text.replace(/```(?:json)?/gi, "");
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, error: "no JSON object found" };
  let raw: unknown;
  try {
    raw = JSON.parse(withoutFences.slice(start, end + 1));
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${String(err)}` };
  }
  const parsed = DiscoverySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  return { ok: true, output: parsed.data };
}
