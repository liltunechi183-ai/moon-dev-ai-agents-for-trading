import YahooFinance from "yahoo-finance2";
import type { Bar } from "@/lib/quant/types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export interface YahooQuote {
  price: number;
  prevClose: number | null;
  dayOpen: number | null;
  currency: string;
  marketOpen: boolean;
}

export async function getYahooQuote(symbol: string): Promise<YahooQuote | null> {
  try {
    const q = await yahooFinance.quote(symbol);
    if (!q || typeof q.regularMarketPrice !== "number") return null;
    return {
      price: q.regularMarketPrice,
      prevClose: q.regularMarketPreviousClose ?? null,
      dayOpen: q.regularMarketOpen ?? null,
      currency: q.currency ?? "USD",
      marketOpen: q.marketState === "REGULAR",
    };
  } catch (err) {
    console.error(`[yahoo] quote failed for ${symbol}:`, err);
    return null;
  }
}

export async function getDailyBars(symbol: string, days = 260): Promise<Bar[]> {
  const period2 = new Date();
  const period1 = new Date();
  period1.setDate(period1.getDate() - Math.ceil(days * 1.6) - 10);

  const result = await yahooFinance.chart(symbol, {
    period1,
    period2,
    interval: "1d",
  });

  const quotes = result.quotes ?? [];
  const bars: Bar[] = quotes
    .filter(
      (q): q is typeof q & { open: number; high: number; low: number; close: number; volume: number } =>
        q.open != null && q.high != null && q.low != null && q.close != null,
    )
    .map((q) => ({
      ts: new Date(q.date).getTime(),
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume ?? 0,
    }));

  return bars.slice(-days);
}
