import { desc, eq, inArray } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import type { AlpacaOrder } from "./client";
import { toAppSymbol } from "./symbols";

export type OrderSource = "manual" | "bot";
export type OrderLogRow = typeof tables.ordersLog.$inferSelect;

const TERMINAL_STATUSES = new Set(["filled", "canceled", "expired", "rejected", "done_for_day"]);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

function parseTs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Pure mapping from an Alpaca order object to an orders_log row (no id). */
export function orderToRow(
  order: AlpacaOrder,
  source: OrderSource,
  parentOrderId: string | null,
): Omit<OrderLogRow, "id"> {
  return {
    alpacaOrderId: order.id,
    parentOrderId,
    symbol: toAppSymbol(order.symbol),
    side: order.side,
    type: order.type,
    qty: order.qty != null ? Number(order.qty) : null,
    notional: order.notional != null ? Number(order.notional) : null,
    limitPrice:
      (order as { limit_price?: string | null }).limit_price != null
        ? Number((order as { limit_price?: string | null }).limit_price)
        : null,
    status: order.status,
    source,
    submittedAt: parseTs((order as { submitted_at?: string }).submitted_at) ?? Date.now(),
    filledAt: parseTs((order as { filled_at?: string | null }).filled_at),
    filledAvgPrice: order.filled_avg_price != null ? Number(order.filled_avg_price) : null,
    raw: order as unknown,
  };
}

/**
 * Pure: find the parent order id for an orphan leg by scanning candidate
 * orders' raw leg arrays for the leg's id.
 */
export function findParentIdInRaw(
  candidates: Array<{ alpacaOrderId: string; raw: unknown }>,
  legOrderId: string,
): string | null {
  for (const c of candidates) {
    const legs = (c.raw as { legs?: Array<{ id?: string }> } | null)?.legs;
    if (Array.isArray(legs) && legs.some((l) => l?.id === legOrderId)) {
      return c.alpacaOrderId;
    }
  }
  return null;
}

/**
 * Record a just-submitted order and each of its bracket legs. Legs are
 * separate Alpaca orders whose fills arrive independently on the stream —
 * writing them now means those fills UPDATE instead of arriving orphaned.
 */
export function insertOrderWithLegs(order: AlpacaOrder, source: OrderSource): void {
  db.insert(tables.ordersLog)
    .values(orderToRow(order, source, null))
    .onConflictDoNothing()
    .run();
  for (const leg of order.legs ?? []) {
    db.insert(tables.ordersLog)
      .values(orderToRow(leg, source, order.id))
      .onConflictDoNothing()
      .run();
  }
}

/**
 * UPSERT an order seen on the trade_updates stream (or via reconcile).
 * An unknown order id is usually a bracket-leg fill — insert it and try to
 * link it to its parent by scanning stored raw leg info; inherit the
 * parent's source so bot trades stay attributed to the bot.
 * Returns true when the order is now terminal-filled (ledger rebuild cue).
 */
export function upsertOrderFromStream(order: AlpacaOrder): boolean {
  const [existing] = db
    .select()
    .from(tables.ordersLog)
    .where(eq(tables.ordersLog.alpacaOrderId, order.id))
    .limit(1)
    .all();

  if (existing) {
    db.update(tables.ordersLog)
      .set({
        status: order.status,
        filledAt: parseTs((order as { filled_at?: string | null }).filled_at) ?? existing.filledAt,
        filledAvgPrice:
          order.filled_avg_price != null ? Number(order.filled_avg_price) : existing.filledAvgPrice,
        raw: order as unknown,
      })
      .where(eq(tables.ordersLog.alpacaOrderId, order.id))
      .run();
  } else {
    // Orphan: link to a parent whose raw legs mention this id.
    const candidates = db
      .select({ alpacaOrderId: tables.ordersLog.alpacaOrderId, raw: tables.ordersLog.raw, source: tables.ordersLog.source })
      .from(tables.ordersLog)
      .where(eq(tables.ordersLog.symbol, toAppSymbol(order.symbol)))
      .all();
    const parentId = findParentIdInRaw(candidates, order.id);
    const parentSource = parentId
      ? (candidates.find((c) => c.alpacaOrderId === parentId) as { source?: OrderSource } | undefined)
          ?.source ?? "manual"
      : "manual";
    db.insert(tables.ordersLog)
      .values(orderToRow(order, parentSource, parentId))
      .onConflictDoNothing()
      .run();
  }

  return order.status === "filled";
}

/** Alpaca order ids of every non-terminal order (for the 60s reconciler). */
export function getOpenOrderIds(): string[] {
  const rows = db
    .select({ alpacaOrderId: tables.ordersLog.alpacaOrderId, status: tables.ordersLog.status })
    .from(tables.ordersLog)
    .all();
  return rows.filter((r) => !isTerminalStatus(r.status)).map((r) => r.alpacaOrderId);
}

export function listOrders(limit = 100): OrderLogRow[] {
  return db
    .select()
    .from(tables.ordersLog)
    .orderBy(desc(tables.ordersLog.submittedAt))
    .limit(limit)
    .all();
}

export function markOrdersCanceled(alpacaOrderIds: string[]): void {
  if (alpacaOrderIds.length === 0) return;
  db.update(tables.ordersLog)
    .set({ status: "canceled" })
    .where(inArray(tables.ordersLog.alpacaOrderId, alpacaOrderIds))
    .run();
}
