import { env } from "@/lib/env";
import { fetchJson } from "./util";

interface StocktwitsResponse {
  messages?: Array<{ entities?: { sentiment?: { basic?: string } | null } }>;
}

/** Stocktwits keyless sentiment: bull/bear tag share over recent messages. */
export async function getStocktwitsSection(symbol: string): Promise<string | null> {
  const data = await fetchJson<StocktwitsResponse>(
    `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`,
  );
  const messages = data.messages ?? [];
  if (messages.length === 0) return null;
  let bull = 0;
  let bear = 0;
  for (const m of messages) {
    const s = m.entities?.sentiment?.basic;
    if (s === "Bullish") bull++;
    else if (s === "Bearish") bear++;
  }
  const tagged = bull + bear;
  if (tagged === 0) return `Stocktwits: ${messages.length} recent messages, none tagged bull/bear.`;
  return `Stocktwits: of ${messages.length} recent messages, ${bull} tagged bullish and ${bear} bearish (${((bull / tagged) * 100).toFixed(0)}% bullish among tagged).`;
}

interface RedditTokenResponse {
  access_token: string;
}

interface RedditSearchResponse {
  data?: { children?: Array<{ data: { title: string; score: number; num_comments: number; created_utc: number } }> };
}

/** Reddit search (requires keys; unauthenticated access is 403). */
export async function getRedditSection(symbol: string): Promise<string | null> {
  if (!env.hasRedditKeys) return null;
  const auth = Buffer.from(`${env.redditClientId}:${env.redditClientSecret}`).toString("base64");
  const token = await fetchJson<RedditTokenResponse>("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "TradeS/0.1",
    },
    body: "grant_type=client_credentials",
  });
  const search = await fetchJson<RedditSearchResponse>(
    `https://oauth.reddit.com/r/stocks+wallstreetbets+investing/search?q=${encodeURIComponent(symbol)}&restrict_sr=1&sort=new&t=week&limit=10`,
    { headers: { Authorization: `Bearer ${token.access_token}`, "User-Agent": "TradeS/0.1" } },
  );
  const posts = search.data?.children ?? [];
  if (posts.length === 0) return `Reddit: no posts mentioning ${symbol} this week.`;
  const lines = posts
    .slice(0, 6)
    .map((p) => `- "${p.data.title}" (${p.data.score} points, ${p.data.num_comments} comments)`);
  return `Reddit posts this week mentioning ${symbol}:\n${lines.join("\n")}`;
}

interface PolymarketMarket {
  question: string;
  outcomePrices?: string;
  outcomes?: string;
  volume?: string;
}

/** Polymarket keyless: any prediction markets mentioning the symbol/company. */
export async function getPolymarketSection(query: string): Promise<string | null> {
  const markets = await fetchJson<PolymarketMarket[]>(
    `https://gamma-api.polymarket.com/markets?closed=false&limit=5&search=${encodeURIComponent(query)}`,
  );
  if (!Array.isArray(markets) || markets.length === 0) return null;
  const lines = markets.slice(0, 5).map((m) => {
    let priceNote = "";
    try {
      const prices = JSON.parse(m.outcomePrices ?? "[]") as string[];
      const outcomes = JSON.parse(m.outcomes ?? "[]") as string[];
      if (prices.length && outcomes.length) {
        priceNote = ` — ${outcomes[0]}: ${(parseFloat(prices[0]) * 100).toFixed(0)}%`;
      }
    } catch {
      // price parse optional
    }
    return `- ${m.question}${priceNote}`;
  });
  return lines.join("\n");
}
