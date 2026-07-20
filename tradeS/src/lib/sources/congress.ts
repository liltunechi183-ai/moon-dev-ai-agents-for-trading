import { env } from "@/lib/env";
import { fetchJson } from "./util";

interface QuiverTrade {
  Representative?: string;
  Senator?: string;
  Transaction: string;
  Range?: string;
  Date?: string;
  TransactionDate?: string;
}

interface SenateWatcherTx {
  ticker: string;
  senator: string;
  type: string;
  amount: string;
  transaction_date: string;
}

/** Congressional trades: Quiver with a key, else a keyless mirror. */
export async function getCongressSection(symbol: string): Promise<string | null> {
  if (env.quiverApiKey) {
    const trades = await fetchJson<QuiverTrade[]>(
      `https://api.quiverquant.com/beta/historical/congresstrading/${encodeURIComponent(symbol)}`,
      { headers: { Authorization: `Bearer ${env.quiverApiKey}` } },
    );
    if (!Array.isArray(trades) || trades.length === 0) return "No congressional trades on record.";
    const lines = trades.slice(0, 8).map((t) => {
      const who = t.Representative ?? t.Senator ?? "member";
      const date = t.TransactionDate ?? t.Date ?? "";
      return `- [${date}] ${who}: ${t.Transaction}${t.Range ? ` (${t.Range})` : ""}`;
    });
    return lines.join("\n");
  }

  // Keyless mirror (senate-stock-watcher). Large file; tolerate failure.
  const all = await fetchJson<SenateWatcherTx[]>(
    "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json",
    {},
    15_000,
  );
  const matches = all.filter((t) => t.ticker?.toUpperCase() === symbol.toUpperCase());
  if (matches.length === 0) return "No senate trades on record for this ticker.";
  const lines = matches
    .slice(-8)
    .reverse()
    .map((t) => `- [${t.transaction_date}] ${t.senator}: ${t.type} (${t.amount})`);
  return lines.join("\n");
}
