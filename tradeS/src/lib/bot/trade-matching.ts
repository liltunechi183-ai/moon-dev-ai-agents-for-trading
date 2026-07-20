export interface FilledOrder {
  alpacaOrderId: string;
  parentOrderId: string | null;
  symbol: string;
  side: "buy" | "sell";
  type: string; // "market" | "limit" | "stop" | ...
  qty: number;
  filledAvgPrice: number;
  filledAt: number;
}

/** Rule attribution captured by bot_activity at fire time, keyed by order id. */
export interface OrderAttribution {
  ruleId: number | null;
  ruleVersion: number | null;
}

export interface RoundTrip {
  symbol: string;
  ruleId: number | null;
  ruleVersion: number | null;
  exitRuleId: number | null;
  qty: number;
  entryOrderId: string;
  exitOrderId: string;
  entryAt: number;
  exitAt: number;
  entryPrice: number;
  exitPrice: number;
  pnlUsd: number;
  pnlPct: number;
  exitKind: "stop-loss" | "take-profit" | "sell-rule" | "other";
}

function exitKindFor(exit: FilledOrder, entryIds: Set<string>): RoundTrip["exitKind"] {
  if (exit.parentOrderId && entryIds.has(exit.parentOrderId)) {
    // Bracket leg: limit leg = take-profit, stop leg = stop-loss.
    if (exit.type === "limit") return "take-profit";
    if (exit.type.includes("stop")) return "stop-loss";
    return "other";
  }
  if (exit.type === "market") return "sell-rule";
  return "other";
}

/**
 * PURE FIFO round-trip matcher over the bot's filled orders. Entries are
 * buy fills; exits are sell fills. Bracket-leg exits close their own
 * parent's lot first; market (sell-rule) exits drain open lots FIFO.
 * Each round trip is attributed to the rule/version that opened it.
 */
export function matchRoundTrips(
  fills: FilledOrder[],
  attribution: Map<string, OrderAttribution>,
): RoundTrip[] {
  const sorted = [...fills].sort((a, b) => a.filledAt - b.filledAt);
  const entryIds = new Set(sorted.filter((f) => f.side === "buy").map((f) => f.alpacaOrderId));

  interface OpenLot {
    order: FilledOrder;
    remaining: number;
  }
  const openLots = new Map<string, OpenLot[]>(); // symbol → FIFO queue
  const trips: RoundTrip[] = [];

  function closeAgainst(lot: OpenLot, exit: FilledOrder, qty: number, exitKind: RoundTrip["exitKind"]) {
    const attr = attribution.get(lot.order.alpacaOrderId);
    const exitAttr = attribution.get(exit.alpacaOrderId);
    const pnlUsd = (exit.filledAvgPrice - lot.order.filledAvgPrice) * qty;
    trips.push({
      symbol: exit.symbol,
      ruleId: attr?.ruleId ?? null,
      ruleVersion: attr?.ruleVersion ?? null,
      exitRuleId: exitKind === "sell-rule" ? (exitAttr?.ruleId ?? null) : null,
      qty,
      entryOrderId: lot.order.alpacaOrderId,
      exitOrderId: exit.alpacaOrderId,
      entryAt: lot.order.filledAt,
      exitAt: exit.filledAt,
      entryPrice: lot.order.filledAvgPrice,
      exitPrice: exit.filledAvgPrice,
      pnlUsd,
      pnlPct: ((exit.filledAvgPrice - lot.order.filledAvgPrice) / lot.order.filledAvgPrice) * 100,
      exitKind,
    });
    lot.remaining -= qty;
  }

  for (const fill of sorted) {
    if (fill.side === "buy") {
      const queue = openLots.get(fill.symbol) ?? [];
      queue.push({ order: fill, remaining: fill.qty });
      openLots.set(fill.symbol, queue);
      continue;
    }

    // Sell fill.
    const queue = openLots.get(fill.symbol) ?? [];
    let toClose = fill.qty;
    const kind = exitKindFor(fill, entryIds);

    if (fill.parentOrderId && entryIds.has(fill.parentOrderId)) {
      // Bracket leg: close its own parent's lot first.
      const own = queue.find((l) => l.order.alpacaOrderId === fill.parentOrderId && l.remaining > 0);
      if (own) {
        const qty = Math.min(own.remaining, toClose);
        closeAgainst(own, fill, qty, kind);
        toClose -= qty;
      }
    }

    // FIFO drain for whatever remains (sell-rule sells, oversized legs).
    for (const lot of queue) {
      if (toClose <= 0) break;
      if (lot.remaining <= 0) continue;
      const qty = Math.min(lot.remaining, toClose);
      closeAgainst(lot, fill, qty, kind);
      toClose -= qty;
    }

    openLots.set(
      fill.symbol,
      queue.filter((l) => l.remaining > 0),
    );
  }

  return trips;
}

export interface RuleStats {
  ruleId: number | null;
  ruleVersion: number | null;
  trades: number;
  wins: number;
  winRate: number;
  totalPnlUsd: number;
  avgPnlPct: number;
  byExitKind: Record<string, { trades: number; totalPnlUsd: number }>;
}

/** Pure aggregation of realized round trips per rule+version. */
export function computeRuleStats(trips: RoundTrip[]): RuleStats[] {
  const groups = new Map<string, RoundTrip[]>();
  for (const t of trips) {
    const key = `${t.ruleId ?? "none"}:${t.ruleVersion ?? 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return [...groups.values()].map((group) => {
    const wins = group.filter((t) => t.pnlUsd > 0).length;
    const byExitKind: RuleStats["byExitKind"] = {};
    for (const t of group) {
      byExitKind[t.exitKind] ??= { trades: 0, totalPnlUsd: 0 };
      byExitKind[t.exitKind].trades++;
      byExitKind[t.exitKind].totalPnlUsd += t.pnlUsd;
    }
    return {
      ruleId: group[0].ruleId,
      ruleVersion: group[0].ruleVersion,
      trades: group.length,
      wins,
      winRate: wins / group.length,
      totalPnlUsd: group.reduce((a, t) => a + t.pnlUsd, 0),
      avgPnlPct: group.reduce((a, t) => a + t.pnlPct, 0) / group.length,
      byExitKind,
    };
  });
}
