"use client";

import { use, useEffect, useState } from "react";
import { useQuoteStream } from "@/hooks/useQuoteStream";
import { CandlestickChart } from "@/components/CandlestickChart";
import { SignalsStrip } from "@/components/SignalsStrip";
import { PredictionSection } from "@/components/PredictionSection";
import type { Bar } from "@/lib/quant/types";
import type { IndicatorSnapshot } from "@/lib/quant/types";
import type { Pattern } from "@/lib/quant/patterns";

interface SignalsPayload {
  indicators: IndicatorSnapshot;
  patterns: Pattern[];
}

export default function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = use(params);
  const symbol = rawSymbol.toUpperCase();
  const { quotes } = useQuoteStream();
  const [bars, setBars] = useState<Bar[]>([]);
  const [signals, setSignals] = useState<SignalsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/bars/${symbol}`).then((r) => r.json()),
      fetch(`/api/signals/${symbol}`).then((r) => r.json()),
    ])
      .then(([barsRes, signalsRes]) => {
        setBars(Array.isArray(barsRes) ? barsRes : []);
        setSignals(signalsRes?.indicators ? signalsRes : null);
      })
      .finally(() => setLoading(false));
  }, [symbol]);

  const quote = quotes[symbol];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{symbol}</h1>
          {quote?.delayed && (
            <span className="text-xs text-amber-500">delayed quote ({quote.currency})</span>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-zinc-100">
            {quote ? quote.price.toFixed(2) : "—"}
          </div>
          {quote?.prevClose && (
            <div
              className={`text-sm tabular-nums ${
                quote.price >= quote.prevClose ? "text-[#22c55e]" : "text-[#ef4444]"
              }`}
            >
              {quote.price >= quote.prevClose ? "+" : ""}
              {(((quote.price - quote.prevClose) / quote.prevClose) * 100).toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}

      {!loading && bars.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
          <CandlestickChart bars={bars} />
        </div>
      )}

      {!loading && bars.length === 0 && (
        <p className="text-sm text-zinc-500">No chart data available for {symbol} yet.</p>
      )}

      {signals && <SignalsStrip indicators={signals.indicators} patterns={signals.patterns} />}

      <PredictionSection symbol={symbol} />
    </div>
  );
}
