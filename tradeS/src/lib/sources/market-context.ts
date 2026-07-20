import { getDailyBars } from "@/lib/yahoo/quotes";
import { sma } from "@/lib/quant/indicators";
import { getCurrentRegime } from "@/lib/research/regime";
import { fmtNum } from "./util";

/** S&P trend + VIX + current regime, rendered as bullets. */
export async function getMarketContextSection(): Promise<string | null> {
  const lines: string[] = [];

  const spyBars = await getDailyBars("SPY", 260);
  if (spyBars.length >= 200) {
    const closes = spyBars.map((b) => b.close);
    const last = closes[closes.length - 1];
    const s50 = sma(closes, 50)[closes.length - 1];
    const s200 = sma(closes, 200)[closes.length - 1];
    const monthAgo = closes[Math.max(0, closes.length - 22)];
    lines.push(
      `- S&P 500 (SPY): ${fmtNum(last)} — ${last >= monthAgo ? "up" : "down"} ${fmtNum(Math.abs(((last - monthAgo) / monthAgo) * 100), 1)}% over the last month`,
    );
    if (s50 !== null) lines.push(`- SPY vs 50-day SMA: ${last >= s50 ? "above" : "below"} (${fmtNum(s50)})`);
    if (s200 !== null) lines.push(`- SPY vs 200-day SMA: ${last >= s200 ? "above" : "below"} (${fmtNum(s200)})`);
  }

  try {
    const vixBars = await getDailyBars("^VIX", 10);
    if (vixBars.length > 0) {
      const vix = vixBars[vixBars.length - 1].close;
      lines.push(`- VIX: ${fmtNum(vix, 1)} (${vix < 15 ? "calm" : vix < 20 ? "normal" : vix < 30 ? "elevated" : "fearful"})`);
    }
  } catch {
    // VIX optional
  }

  const regime = await getCurrentRegime();
  if (regime) lines.push(`- Market regime: ${regime}`);

  return lines.length > 0 ? lines.join("\n") : null;
}
