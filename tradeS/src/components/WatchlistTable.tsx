"use client";

import Link from "next/link";
import type { Quote } from "@/hooks/useQuoteStream";
import { useI18n } from "@/lib/i18n/provider";

export interface WatchlistItem {
  symbol: string;
  addedAt: number;
}

export function WatchlistTable({
  items,
  quotes,
  onDelete,
}: {
  items: WatchlistItem[];
  quotes: Record<string, Quote>;
  onDelete: (symbol: string) => void;
}) {
  const { t } = useI18n();
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{t("dashboard.noWatchlist")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2 text-right">Day change</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const q = quotes[item.symbol];
            const price = q?.price ?? null;
            const dayChangePct =
              price !== null && q?.prevClose ? ((price - q.prevClose) / q.prevClose) * 100 : null;
            return (
              <tr key={item.symbol} className="border-b border-white/5 last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/stock/${item.symbol}`} className="font-medium text-zinc-100 hover:underline">
                    {item.symbol}
                  </Link>
                  {q?.delayed && <span className="ml-2 text-[10px] text-amber-500">delayed</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {price !== null
                    ? new Intl.NumberFormat("en-US", { style: "currency", currency: q?.currency ?? "USD" }).format(
                        price,
                      )
                    : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    dayChangePct === null ? "text-zinc-500" : dayChangePct >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
                  }`}
                >
                  {dayChangePct !== null ? `${dayChangePct >= 0 ? "+" : ""}${dayChangePct.toFixed(2)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onDelete(item.symbol)}
                    className="text-xs text-zinc-500 hover:text-[#ef4444]"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
