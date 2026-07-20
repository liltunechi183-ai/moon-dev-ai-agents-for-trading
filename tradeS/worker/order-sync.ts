import cron from "node-cron";
import { db, tables } from "@/lib/db";
import { env } from "@/lib/env";
import { alpaca } from "@/lib/alpaca/client";
import { connectTradeStream } from "@/lib/alpaca/trade-stream";
import { upsertOrderFromStream, getOpenOrderIds } from "@/lib/alpaca/orders-log";

const RECONCILE_MS = 60_000;

// Debounce hook for the derived bot_trades ledger; Phase 4 replaces the
// body with rebuildBotTrades().
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleLedgerRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    onFillsSettled();
  }, 3000);
}

let onFillsSettled: () => void = () => {};
/** Phase 4 wires rebuildBotTrades in here. */
export function setFillSettledHandler(fn: () => void): void {
  onFillsSettled = fn;
}

/** Write one point on the equity curve. */
export async function snapshotAccount(): Promise<void> {
  if (!env.hasAlpacaKeys) return;
  try {
    const account = await alpaca.getAccount();
    db.insert(tables.accountSnapshots)
      .values({
        ts: Date.now(),
        equity: Number(account.equity),
        cash: Number(account.cash),
        buyingPower: Number(account.buying_power),
      })
      .onConflictDoNothing()
      .run();
  } catch (err) {
    console.error("[order-sync] account snapshot failed:", err);
  }
}

export function startOrderSync(): void {
  if (!env.hasAlpacaKeys) {
    console.log("[order-sync] no Alpaca keys — skipping");
    return;
  }

  connectTradeStream((event) => {
    try {
      const filled = upsertOrderFromStream(event.order);
      if (filled) scheduleLedgerRebuild();
    } catch (err) {
      console.error("[order-sync] failed to upsert stream event:", err);
    }
  });

  setInterval(() => {
    reconcileOpenOrders().catch((err) => console.error("[order-sync] reconcile failed:", err));
  }, RECONCILE_MS);

  // Equity curve: every 15 min in market hours + one post-close point.
  cron.schedule("*/15 9-16 * * 1-5", () => void snapshotAccount(), { timezone: "America/New_York" });
  cron.schedule("5 16 * * 1-5", () => void snapshotAccount(), { timezone: "America/New_York" });
  setTimeout(() => void snapshotAccount(), 15_000);
}

async function reconcileOpenOrders(): Promise<void> {
  const openIds = new Set(getOpenOrderIds());
  if (openIds.size === 0) return;
  // One list call covers all open + recently closed orders.
  const orders = await alpaca.listOrders({ status: "all", limit: "100" });
  let anyFilled = false;
  for (const order of orders) {
    if (!openIds.has(order.id)) continue;
    const filled = upsertOrderFromStream(order);
    anyFilled = anyFilled || filled;
  }
  if (anyFilled) scheduleLedgerRebuild();
}
