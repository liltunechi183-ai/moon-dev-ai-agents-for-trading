import { getDailyBars } from "@/lib/yahoo/quotes";
import { cacheDailyBars } from "@/lib/bars";
import { buildQuantPayload } from "@/lib/quant/snapshot";
import type { IndicatorSnapshot } from "@/lib/quant/types";
import type { Pattern } from "@/lib/quant/patterns";
import { getNewsSection } from "@/lib/sources/news";
import { getFundamentalsSection } from "@/lib/sources/fundamentals";
import { getEdgarSection } from "@/lib/sources/edgar";
import { getMarketContextSection } from "@/lib/sources/market-context";
import { getStocktwitsSection, getRedditSection, getPolymarketSection } from "@/lib/sources/sentiment";
import { getCongressSection } from "@/lib/sources/congress";
import { fmtNum } from "@/lib/sources/util";

export interface ResearchPacket {
  symbol: string;
  generatedAt: number;
  markdown: string;
  quantSnapshot: { indicators: IndicatorSnapshot; patterns: Pattern[] };
}

export function renderQuantBullets(ind: IndicatorSnapshot, patterns: Pattern[]): string {
  const lines: string[] = [];
  const price = ind.lastClose;
  const vs = (ma: number | null, name: string) => {
    if (price === null || ma === null) return;
    const pct = ((price - ma) / ma) * 100;
    lines.push(`- Price is ${Math.abs(pct).toFixed(1)}% ${pct >= 0 ? "above" : "below"} the ${name}`);
  };
  if (price !== null) lines.push(`- Last close: ${fmtNum(price)}`);
  vs(ind.sma20, "20-day SMA");
  vs(ind.sma50, "50-day SMA");
  vs(ind.sma200, "200-day SMA");
  if (ind.rsi14 !== null) {
    const zone = ind.rsi14 >= 70 ? "overbought" : ind.rsi14 <= 30 ? "oversold" : "neutral zone";
    lines.push(`- RSI(14): ${ind.rsi14.toFixed(0)} (${zone})`);
  }
  if (ind.macdHist !== null) {
    lines.push(`- MACD histogram is ${ind.macdHist >= 0 ? "positive (momentum up)" : "negative (momentum down)"}`);
  }
  if (ind.volumeRatio !== null) {
    lines.push(`- Latest volume is ${(ind.volumeRatio * 100).toFixed(0)}% of the 20-day average`);
  }
  if (ind.pctFrom52wHigh !== null) lines.push(`- ${Math.abs(ind.pctFrom52wHigh).toFixed(1)}% below the 52-week high`);
  if (ind.pctFrom52wLow !== null) lines.push(`- ${ind.pctFrom52wLow.toFixed(1)}% above the 52-week low`);
  if (ind.atrPct !== null) lines.push(`- ATR: ${ind.atrPct.toFixed(2)}% of price per day (volatility)`);
  if (ind.bollingerPosition !== null) {
    lines.push(`- Bollinger band position: ${(ind.bollingerPosition * 100).toFixed(0)}% (0 = lower band, 100 = upper)`);
  }
  if (ind.obvSlope !== null) {
    lines.push(`- OBV (volume flow) is ${ind.obvSlope > 0 ? "rising" : ind.obvSlope < 0 ? "falling" : "flat"}`);
  }
  if (patterns.length > 0) {
    lines.push(`- Detected patterns: ${patterns.map((p) => `${p.type} (${p.description})`).join("; ")}`);
  } else {
    lines.push("- No chart patterns detected right now");
  }
  return lines.join("\n");
}

/**
 * Gather everything an analyst needs for one symbol. Daily bars are the only
 * hard dependency — no bars, no packet. Every other source degrades
 * gracefully into the Data Gaps section.
 */
export async function buildResearchPacket(symbol: string): Promise<ResearchPacket> {
  const bars = await getDailyBars(symbol, 260); // throws → no packet
  if (bars.length === 0) throw new Error(`no daily bars available for ${symbol}`);
  cacheDailyBars(symbol, bars);

  const quantSnapshot = buildQuantPayload(bars);

  const [news, fundamentals, edgar, marketContext, stocktwits, reddit, polymarket, congress] =
    await Promise.allSettled([
      getNewsSection(symbol),
      getFundamentalsSection(symbol),
      getEdgarSection(symbol),
      getMarketContextSection(),
      getStocktwitsSection(symbol),
      getRedditSection(symbol),
      getPolymarketSection(symbol),
      getCongressSection(symbol),
    ]);

  const gaps: string[] = [];
  const section = (
    title: string,
    result: PromiseSettledResult<string | null>,
    gapNote: string,
  ): string => {
    if (result.status === "rejected") {
      gaps.push(`${gapNote} (fetch failed)`);
      return "";
    }
    if (result.value === null) {
      gaps.push(gapNote);
      return "";
    }
    return `\n## ${title}\n\n${result.value}\n`;
  };

  let filingsText = "";
  let insidersText = "";
  if (edgar.status === "fulfilled") {
    if (edgar.value.filings) filingsText = `\n## Recent SEC filings\n\n${edgar.value.filings}\n`;
    else gaps.push("SEC filings unavailable");
    if (edgar.value.insiders) insidersText = `\n## Insider activity\n\n${edgar.value.insiders}\n`;
    else gaps.push("insider activity unavailable");
  } else {
    gaps.push("SEC filings + insider activity (fetch failed)");
  }

  const generatedAt = Date.now();
  const markdown = `# Research packet: ${symbol}

Generated ${new Date(generatedAt).toISOString()}. All numbers below are
deterministic; anything missing is listed under Data Gaps.

## Quantitative signals (daily bars)

${renderQuantBullets(quantSnapshot.indicators, quantSnapshot.patterns)}
${section("Market context", marketContext, "market context (S&P/VIX) unavailable")}${section("Recent news", news, "news unavailable (needs Alpaca keys, US tickers only)")}${section("Fundamentals", fundamentals, "fundamentals unavailable")}${filingsText}${insidersText}${section("Social sentiment — Stocktwits", stocktwits, "Stocktwits sentiment unavailable")}${section("Social sentiment — Reddit", reddit, "Reddit sentiment unavailable (needs Reddit keys)")}${section("Prediction markets — Polymarket", polymarket, "no Polymarket markets found")}${section("Congressional trades", congress, "congressional trades unavailable")}
## Data Gaps

${gaps.length > 0 ? gaps.map((g) => `- ${g}`).join("\n") : "- none"}
`;

  return { symbol, generatedAt, markdown, quantSnapshot };
}
