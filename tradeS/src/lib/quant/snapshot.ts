import { computeSnapshot } from "./indicators";
import { detectPatterns } from "./patterns";
import { rsi } from "./indicators";
import type { Bar } from "./types";

/** Combined quant payload persisted to quant_signals.payload. */
export function buildQuantPayload(bars: Bar[]) {
  const indicators = computeSnapshot(bars);
  const rsiArr = rsi(bars.map((b) => b.close), 14);
  const patterns = detectPatterns(bars, rsiArr);
  return { indicators, patterns };
}
