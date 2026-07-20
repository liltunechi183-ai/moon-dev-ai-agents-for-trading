import { eq, isNotNull, and } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { matchRoundTrips, computeRuleStats, type FilledOrder, type OrderAttribution, type RuleStats } from "./trade-matching";

/**
 * Rebuild the derived bot_trades table from scratch: bot-source filled
 * orders from orders_log (parents AND their legs — legs inherit the bot
 * source when linked) paired FIFO, attributed via bot_activity snapshots.
 */
export function rebuildBotTrades(): number {
  const orderRows = db
    .select()
    .from(tables.ordersLog)
    .where(and(eq(tables.ordersLog.source, "bot"), eq(tables.ordersLog.status, "filled")))
    .all();

  const fills: FilledOrder[] = orderRows
    .filter((o) => o.filledAvgPrice != null && (o.qty != null || o.notional != null))
    .map((o) => ({
      alpacaOrderId: o.alpacaOrderId,
      parentOrderId: o.parentOrderId,
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      qty: o.qty ?? (o.notional! / o.filledAvgPrice!),
      filledAvgPrice: o.filledAvgPrice!,
      filledAt: o.filledAt ?? o.submittedAt,
    }));

  const activityRows = db
    .select({
      orderId: tables.botActivity.orderId,
      ruleId: tables.botActivity.ruleId,
      ruleVersion: tables.botActivity.ruleVersion,
    })
    .from(tables.botActivity)
    .where(isNotNull(tables.botActivity.orderId))
    .all();

  const attribution = new Map<string, OrderAttribution>();
  for (const a of activityRows) {
    if (a.orderId) attribution.set(a.orderId, { ruleId: a.ruleId, ruleVersion: a.ruleVersion });
  }

  const trips = matchRoundTrips(fills, attribution);

  db.transaction((tx) => {
    tx.delete(tables.botTrades).run();
    for (const t of trips) {
      tx.insert(tables.botTrades).values(t).run();
    }
  });

  return trips.length;
}

/** Realized per-rule performance — the ground truth the rule advisor cites. */
export function getRuleStats(): RuleStats[] {
  const trips = db.select().from(tables.botTrades).all();
  return computeRuleStats(
    trips.map((t) => ({
      symbol: t.symbol,
      ruleId: t.ruleId,
      ruleVersion: t.ruleVersion,
      exitRuleId: t.exitRuleId,
      qty: t.qty,
      entryOrderId: t.entryOrderId,
      exitOrderId: t.exitOrderId,
      entryAt: t.entryAt,
      exitAt: t.exitAt,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      pnlUsd: t.pnlUsd,
      pnlPct: t.pnlPct,
      exitKind: t.exitKind,
    })),
  );
}
