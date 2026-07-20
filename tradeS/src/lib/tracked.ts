import { db, tables } from "@/lib/db";

/** Prediction universe = holdings ∪ watchlist. */
export function getTrackedSymbols(): string[] {
  const holdingSymbols = db.select({ symbol: tables.holdings.symbol }).from(tables.holdings).all();
  const watchlistSymbols = db.select({ symbol: tables.watchlist.symbol }).from(tables.watchlist).all();
  const set = new Set<string>();
  for (const h of holdingSymbols) set.add(h.symbol);
  for (const w of watchlistSymbols) set.add(w.symbol);
  return Array.from(set);
}
