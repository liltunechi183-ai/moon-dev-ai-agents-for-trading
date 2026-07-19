import cron from "node-cron";
import { db, tables } from "@/lib/db";
import { getTrackedSymbols } from "@/lib/tracked";
import { getDailyBars } from "@/lib/yahoo/quotes";
import { buildQuantPayload } from "@/lib/quant/snapshot";
import { cacheDailyBars } from "@/lib/bars";

async function computeAndStore(symbol: string) {
  try {
    const bars = await getDailyBars(symbol, 260);
    if (bars.length === 0) return;
    cacheDailyBars(symbol, bars);
    const payload = buildQuantPayload(bars);
    db.insert(tables.quantSignals)
      .values({ symbol, computedAt: Date.now(), payload })
      .run();
  } catch (err) {
    console.error(`[signal-runner] failed for ${symbol}:`, err);
  }
}

async function runAll() {
  const symbols = getTrackedSymbols();
  console.log(`[signal-runner] computing signals for ${symbols.length} symbols`);
  for (const symbol of symbols) {
    await computeAndStore(symbol);
  }
}

export function startSignalRunner(): void {
  // Every 30 min during market hours (9am-4pm ET, Mon-Fri).
  cron.schedule("*/30 9-16 * * 1-5", () => {
    runAll().catch((err) => console.error("[signal-runner] tick failed:", err));
  }, { timezone: "America/New_York" });

  // Daily close sweep.
  cron.schedule("0 18 * * 1-5", () => {
    runAll().catch((err) => console.error("[signal-runner] close sweep failed:", err));
  }, { timezone: "America/New_York" });

  // Prime once shortly after boot.
  setTimeout(() => {
    runAll().catch((err) => console.error("[signal-runner] initial run failed:", err));
  }, 5000);
}
