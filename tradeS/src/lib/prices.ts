import { db, tables } from "@/lib/db";

export interface PriceUpdate {
  symbol: string;
  price: number;
  prevClose?: number | null;
  dayOpen?: number | null;
  marketOpen: boolean;
  source: "alpaca" | "yahoo";
  delayed: boolean;
  currency: string;
}

export function writeLatestPrice(update: PriceUpdate): void {
  const ts = Date.now();
  db.insert(tables.latestPrices)
    .values({
      symbol: update.symbol,
      price: update.price,
      prevClose: update.prevClose ?? null,
      dayOpen: update.dayOpen ?? null,
      ts,
      marketOpen: update.marketOpen,
      source: update.source,
      delayed: update.delayed,
      currency: update.currency,
    })
    .onConflictDoUpdate({
      target: tables.latestPrices.symbol,
      set: {
        price: update.price,
        prevClose: update.prevClose ?? null,
        dayOpen: update.dayOpen ?? null,
        ts,
        marketOpen: update.marketOpen,
        source: update.source,
        delayed: update.delayed,
        currency: update.currency,
      },
    })
    .run();
}
