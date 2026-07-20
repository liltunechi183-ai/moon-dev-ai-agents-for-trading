"use client";

import Link from "next/link";
import type { TicketPrefill } from "./OrderTicket";

export interface PositionDto {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  side: string;
}

export function PositionsTable({
  positions,
  onClose,
}: {
  positions: PositionDto[];
  onClose: (prefill: TicketPrefill) => void;
}) {
  if (positions.length === 0) {
    return <p className="text-sm text-zinc-500">No open positions.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Entry</th>
            <th className="px-3 py-2 text-right">Now</th>
            <th className="px-3 py-2 text-right">P/L</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.symbol} className="border-b border-white/5 last:border-0">
              <td className="px-3 py-2">
                <Link href={`/stock/${p.symbol}`} className="font-medium text-zinc-100 hover:underline">
                  {p.symbol}
                </Link>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{p.qty}</td>
              <td className="px-3 py-2 text-right tabular-nums">{p.avgEntryPrice.toFixed(2)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{p.currentPrice.toFixed(2)}</td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  p.unrealizedPl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
                }`}
              >
                {p.unrealizedPl >= 0 ? "+" : ""}
                {p.unrealizedPl.toFixed(2)} ({p.unrealizedPlPct >= 0 ? "+" : ""}
                {p.unrealizedPlPct.toFixed(1)}%)
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => onClose({ symbol: p.symbol, side: "sell", qty: p.qty })}
                  className="text-xs text-zinc-500 hover:text-[#ef4444]"
                >
                  Close
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
