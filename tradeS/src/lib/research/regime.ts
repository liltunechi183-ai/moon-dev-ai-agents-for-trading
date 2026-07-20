import type { Bar } from "@/lib/quant/types";
import { sma } from "@/lib/quant/indicators";
import { getDailyBars } from "@/lib/yahoo/quotes";

export type Regime = "bull-calm" | "bull-vol" | "bear" | "chop";

const VIX_CALM_THRESHOLD = 20;
const TREND_BUFFER = 0.01; // ±1% dead zone around the 200-day SMA = chop

/**
 * Pure regime classifier: S&P vs its 200-day SMA × VIX level. Point-in-time
 * safe when fed historical values.
 */
export function classifyRegime(
  spxPrice: number,
  spxSma200: number,
  vix: number | null,
): Regime {
  if (spxPrice > spxSma200 * (1 + TREND_BUFFER)) {
    if (vix !== null && vix >= VIX_CALM_THRESHOLD) return "bull-vol";
    return "bull-calm";
  }
  if (spxPrice < spxSma200 * (1 - TREND_BUFFER)) return "bear";
  return "chop";
}

let cache: { regime: Regime; at: number } | null = null;
const CACHE_MS = 60 * 60_000;

/** Current market regime from live SPY + ^VIX data; null when data unavailable. */
export async function getCurrentRegime(): Promise<Regime | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.regime;
  try {
    const spyBars = await getDailyBars("SPY", 260);
    if (spyBars.length < 200) return null;
    const closes = spyBars.map((b) => b.close);
    const sma200 = sma(closes, 200)[closes.length - 1];
    if (sma200 === null) return null;

    let vix: number | null = null;
    try {
      const vixBars = await getDailyBars("^VIX", 10);
      vix = vixBars.length ? vixBars[vixBars.length - 1].close : null;
    } catch {
      vix = null;
    }

    const regime = classifyRegime(closes[closes.length - 1], sma200, vix);
    cache = { regime, at: Date.now() };
    return regime;
  } catch {
    return null;
  }
}

/** Regime at a historical index of an SPY series (for point-in-time sims). */
export function regimeAtIndex(spyBars: Bar[], index: number, vixAtIndex: number | null): Regime | null {
  if (index < 199 || index >= spyBars.length) return null;
  const closes = spyBars.slice(0, index + 1).map((b) => b.close);
  const sma200 = sma(closes, 200)[closes.length - 1];
  if (sma200 === null) return null;
  return classifyRegime(closes[closes.length - 1], sma200, vixAtIndex);
}
