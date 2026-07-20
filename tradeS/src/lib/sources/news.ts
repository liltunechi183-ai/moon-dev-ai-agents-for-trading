import { env } from "@/lib/env";
import { alpaca } from "@/lib/alpaca/client";
import { isUsTicker } from "@/lib/alpaca/symbols";

interface NewsItem {
  headline: string;
  summary?: string;
  source?: string;
  created_at?: string;
  url?: string;
}

/** Alpaca news — US tickers only, requires keys. Returns markdown or null. */
export async function getNewsSection(symbol: string): Promise<string | null> {
  if (!env.hasAlpacaKeys || !isUsTicker(symbol)) return null;
  const res = await alpaca.getNews([symbol], 10);
  const items = (res.news as NewsItem[]) ?? [];
  if (items.length === 0) return "No recent news found.";
  return items
    .map((n) => {
      const date = n.created_at ? n.created_at.slice(0, 10) : "";
      const summary = n.summary ? ` — ${n.summary.slice(0, 300)}` : "";
      return `- [${date}] ${n.headline}${summary}${n.source ? ` (${n.source})` : ""}`;
    })
    .join("\n");
}
