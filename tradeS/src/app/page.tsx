"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuoteStream } from "@/hooks/useQuoteStream";
import { MarketStatusPill } from "@/components/MarketStatusPill";
import { PortfolioTable, type Holding } from "@/components/PortfolioTable";
import { HoldingForm } from "@/components/HoldingForm";
import { WatchlistTable, type WatchlistItem } from "@/components/WatchlistTable";
import { AddTickerForm } from "@/components/AddTickerForm";
import { useI18n } from "@/lib/i18n/provider";

export default function DashboardPage() {
  const { t } = useI18n();
  const { quotes, clock } = useQuoteStream();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  const refresh = useCallback(async () => {
    const [h, w] = await Promise.all([
      fetch("/api/holdings").then((r) => r.json()),
      fetch("/api/watchlist").then((r) => r.json()),
    ]);
    setHoldings(h);
    setWatchlist(w);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function deleteHolding(id: number) {
    await fetch(`/api/holdings/${id}`, { method: "DELETE" });
    refresh();
  }

  async function deleteWatch(symbol: string) {
    await fetch(`/api/watchlist/${symbol}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-100">{t("dashboard.title")}</h1>
        <MarketStatusPill clock={clock} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("dashboard.holdings")}</h2>
        <PortfolioTable holdings={holdings} quotes={quotes} onDelete={deleteHolding} />
        <HoldingForm onAdded={refresh} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("dashboard.watchlist")}</h2>
        <WatchlistTable items={watchlist} quotes={quotes} onDelete={deleteWatch} />
        <AddTickerForm onAdded={refresh} />
      </section>
    </div>
  );
}
