import { env } from "@/lib/env";
import { getTrackedSymbols } from "@/lib/tracked";
import { writeLatestPrice } from "@/lib/prices";
import { getYahooQuote } from "@/lib/yahoo/quotes";
import { isUsTicker } from "@/lib/alpaca/symbols";

const POLL_INTERVAL_MS = 2 * 60_000;

/**
 * Delayed quotes via Yahoo for international tickers, and for ALL US
 * tickers when there are no Alpaca keys (so the app still works with zero
 * configuration).
 */
export function startYahooPoller(): void {
  async function pollOnce() {
    const symbols = getTrackedSymbols();
    const targets = env.hasAlpacaKeys ? symbols.filter((s) => !isUsTicker(s)) : symbols;

    for (const symbol of targets) {
      const quote = await getYahooQuote(symbol);
      if (!quote) continue;
      writeLatestPrice({
        symbol,
        price: quote.price,
        prevClose: quote.prevClose,
        dayOpen: quote.dayOpen,
        marketOpen: quote.marketOpen,
        source: "yahoo",
        delayed: true,
        currency: quote.currency,
      });
    }
  }

  pollOnce().catch((err) => console.error("[yahoo-poller] initial poll failed:", err));
  setInterval(() => {
    pollOnce().catch((err) => console.error("[yahoo-poller] poll failed:", err));
  }, POLL_INTERVAL_MS);
}
