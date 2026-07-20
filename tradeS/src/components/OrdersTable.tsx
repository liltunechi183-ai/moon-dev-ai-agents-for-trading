"use client";

const TERMINAL = new Set(["filled", "canceled", "expired", "rejected", "done_for_day"]);

export interface OrderRowDto {
  id: number;
  alpacaOrderId: string;
  parentOrderId: string | null;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  qty: number | null;
  notional: number | null;
  status: string;
  source: "manual" | "bot";
  submittedAt: number;
  filledAvgPrice: number | null;
}

export function OrdersTable({
  orders,
  onCancel,
}: {
  orders: OrderRowDto[];
  onCancel: (alpacaOrderId: string) => void;
}) {
  if (orders.length === 0) {
    return <p className="text-sm text-zinc-500">No orders yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Side</th>
            <th className="px-3 py-2 text-right">Size</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-white/5 last:border-0">
              <td className="px-3 py-2 text-xs text-zinc-500">
                {new Date(o.submittedAt).toLocaleString()}
              </td>
              <td className="px-3 py-2 font-medium text-zinc-100">
                {o.symbol}
                {o.parentOrderId && <span className="ml-1 text-[10px] text-zinc-500">(leg)</span>}
              </td>
              <td className={`px-3 py-2 ${o.side === "buy" ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                {o.side} {o.type}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {o.qty != null ? `${o.qty} sh` : o.notional != null ? `$${o.notional}` : "—"}
                {o.filledAvgPrice != null && (
                  <span className="ml-1 text-xs text-zinc-500">@ {o.filledAvgPrice.toFixed(2)}</span>
                )}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    o.status === "filled"
                      ? "bg-[#22c55e]/10 text-[#22c55e]"
                      : TERMINAL.has(o.status)
                        ? "bg-white/[0.04] text-zinc-500"
                        : "bg-[#38bdf8]/10 text-[#38bdf8]"
                  }`}
                >
                  {o.status}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-zinc-500">{o.source}</td>
              <td className="px-3 py-2 text-right">
                {!TERMINAL.has(o.status) && (
                  <button
                    onClick={() => onCancel(o.alpacaOrderId)}
                    className="text-xs text-zinc-500 hover:text-[#ef4444]"
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
