"use client";

import { useCallback, useEffect, useState } from "react";
import { PredictionCard } from "@/components/PredictionCard";
import { AccuracyPanel } from "@/components/AccuracyPanel";
import type { AccuracyDto, PredictionListItem } from "@/lib/predictions-types";

export default function PredictionsPage() {
  const [items, setItems] = useState<PredictionListItem[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [predRes, accRes] = await Promise.all([
      fetch("/api/predictions").then((r) => r.json()),
      fetch("/api/accuracy").then((r) => r.json()),
    ]);
    setItems(predRes);
    setAccuracy(accRes);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Predictions</h1>
        <p className="text-xs text-zinc-500">
          Decision-support research only — not financial advice. Every call is stored and graded
          against what the price actually did.
        </p>
      </div>

      {accuracy && <AccuracyPanel stats={accuracy} />}

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-zinc-500">
          Nothing tracked yet — add holdings or watchlist tickers on the Dashboard first.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <PredictionCard key={item.symbol} item={item} onRefresh={refresh} />
        ))}
      </div>
    </div>
  );
}
