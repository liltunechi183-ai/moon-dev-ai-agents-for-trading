import { eq, and, asc } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import type { Bar } from "@/lib/quant/types";

const DAILY_TIMEFRAME = "1Day";

export function cacheDailyBars(symbol: string, bars: Bar[]): void {
  if (bars.length === 0) return;
  db.transaction((tx) => {
    for (const bar of bars) {
      tx.insert(tables.barsCache)
        .values({ ...bar, symbol, timeframe: DAILY_TIMEFRAME })
        .onConflictDoUpdate({
          target: [tables.barsCache.symbol, tables.barsCache.timeframe, tables.barsCache.ts],
          set: { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume },
        })
        .run();
    }
  });
}

export function getCachedDailyBars(symbol: string): Bar[] {
  return db
    .select({
      ts: tables.barsCache.ts,
      open: tables.barsCache.open,
      high: tables.barsCache.high,
      low: tables.barsCache.low,
      close: tables.barsCache.close,
      volume: tables.barsCache.volume,
    })
    .from(tables.barsCache)
    .where(and(eq(tables.barsCache.symbol, symbol), eq(tables.barsCache.timeframe, DAILY_TIMEFRAME)))
    .orderBy(asc(tables.barsCache.ts))
    .all();
}
