"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Quote } from "@/hooks/useQuoteStream";
import { useI18n } from "@/lib/i18n/provider";

export interface Holding {
  id: number;
  symbol: string;
  shares: number;
  costBasis: number;
  notes: string | null;
}

function fmtMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

export function PortfolioTable({
  holdings,
  quotes,
  onDelete,
}: {
  holdings: Holding[];
  quotes: Record<string, Quote>;
  onDelete: (id: number) => void;
}) {
  const { t } = useI18n();
  const prevPrices = useRef<Record<string, number>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | undefined>>({});

  useEffect(() => {
    const nextFlash: Record<string, "up" | "down" | undefined> = {};
    for (const h of holdings) {
      const q = quotes[h.symbol];
      if (!q) continue;
      const prev = prevPrices.current[h.symbol];
      if (prev !== undefined && prev !== q.price) {
        nextFlash[h.symbol] = q.price > prev ? "up" : "down";
      }
      prevPrices.current[h.symbol] = q.price;
    }
    if (Object.keys(nextFlash).length) {
      setFlash(nextFlash);
      const timer = setTimeout(() => setFlash({}), 700);
      return () => clearTimeout(timer);
    }
  }, [quotes, holdings]);

  if (holdings.length === 0) {
    return <p className="text-sm text-zinc-500">{t("dashboard.noHoldings")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2 text-right">Shares</th>
            <th className="px-3 py-2 text-right">Cost basis</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2 text-right">Day change</th>
            <th className="px-3 py-2 text-right">Total gain</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const q = quotes[h.symbol];
            const price = q?.price ?? null;
            const dayChangePct =
              price !== null && q?.prevClose ? ((price - q.prevClose) / q.prevClose) * 100 : null;
            const totalGain = price !== null ? (price - h.costBasis) * h.shares : null;
            const totalGainPct = price !== null ? ((price - h.costBasis) / h.costBasis) * 100 : null;
            const cellFlash = flash[h.symbol];

            return (
              <tr key={h.id} className="border-b border-white/5 last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/stock/${h.symbol}`} className="font-medium text-zinc-100 hover:underline">
                    {h.symbol}
                  </Link>
                  {q?.delayed && <span className="ml-2 text-[10px] text-amber-500">delayed</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{h.shares}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(h.costBasis, q?.currency)}</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    cellFlash === "up" ? "flash-up" : cellFlash === "down" ? "flash-down" : ""
                  }`}
                >
                  {price !== null ? fmtMoney(price, q?.currency) : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    dayChangePct === null ? "text-zinc-500" : dayChangePct >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
                  }`}
                >
                  {dayChangePct !== null ? `${dayChangePct >= 0 ? "+" : ""}${dayChangePct.toFixed(2)}%` : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    totalGain === null ? "text-zinc-500" : totalGain >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
                  }`}
                >
                  {totalGain !== null
                    ? `${fmtMoney(totalGain, q?.currency)} (${totalGainPct! >= 0 ? "+" : ""}${totalGainPct!.toFixed(1)}%)`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onDelete(h.id)}
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
