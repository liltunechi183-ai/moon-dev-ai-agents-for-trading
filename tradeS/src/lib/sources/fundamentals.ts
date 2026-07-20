import YahooFinance from "yahoo-finance2";
import { fmtBig, fmtNum } from "./util";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/** Yahoo fundamentals snapshot rendered as plain-English bullets. */
export async function getFundamentalsSection(symbol: string): Promise<string | null> {
  const res = await yahooFinance.quoteSummary(symbol, {
    modules: ["summaryDetail", "defaultKeyStatistics", "financialData", "calendarEvents"],
  });

  const sd = res.summaryDetail;
  const ks = res.defaultKeyStatistics;
  const fd = res.financialData;
  const ce = res.calendarEvents;

  const lines: string[] = [];
  if (sd?.marketCap != null) lines.push(`- Market cap: ${fmtBig(sd.marketCap)}`);
  if (sd?.trailingPE != null) lines.push(`- Trailing P/E: ${fmtNum(sd.trailingPE)}`);
  if (sd?.forwardPE != null) lines.push(`- Forward P/E: ${fmtNum(sd.forwardPE)}`);
  if (sd?.dividendYield != null) lines.push(`- Dividend yield: ${fmtNum(sd.dividendYield * 100)}%`);
  if (ks?.pegRatio != null) lines.push(`- PEG ratio: ${fmtNum(ks.pegRatio)}`);
  if (fd?.revenueGrowth != null) lines.push(`- Revenue growth (yoy): ${fmtNum(fd.revenueGrowth * 100, 1)}%`);
  if (fd?.earningsGrowth != null) lines.push(`- Earnings growth (yoy): ${fmtNum(fd.earningsGrowth * 100, 1)}%`);
  if (fd?.profitMargins != null) lines.push(`- Profit margin: ${fmtNum(fd.profitMargins * 100, 1)}%`);
  if (fd?.grossMargins != null) lines.push(`- Gross margin: ${fmtNum(fd.grossMargins * 100, 1)}%`);
  if (fd?.debtToEquity != null) lines.push(`- Debt/equity: ${fmtNum(fd.debtToEquity, 1)}`);
  if (fd?.freeCashflow != null) lines.push(`- Free cash flow: ${fmtBig(fd.freeCashflow)}`);
  if (fd?.recommendationKey) lines.push(`- Street consensus: ${fd.recommendationKey}`);
  if (fd?.numberOfAnalystOpinions != null) lines.push(`- Analysts covering: ${fd.numberOfAnalystOpinions}`);
  if (fd?.targetMeanPrice != null && fd?.currentPrice != null) {
    lines.push(
      `- Mean analyst target: ${fmtNum(fd.targetMeanPrice)} vs current ${fmtNum(fd.currentPrice)}`,
    );
  }
  const earningsDates = ce?.earnings?.earningsDate;
  if (earningsDates && earningsDates.length > 0) {
    const d = earningsDates[0];
    lines.push(`- Next earnings date: ${d instanceof Date ? d.toISOString().slice(0, 10) : String(d)}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}
