"use client";

import { useCallback, useEffect, useState } from "react";
import { PredictionCard } from "./PredictionCard";
import type { CalibrationDto, OutcomeDto, PredictionDto } from "@/lib/predictions-types";

interface HistoryEntry {
  prediction: PredictionDto;
  outcome: OutcomeDto | null;
}

/** Latest prediction (+run button) and collapsible history for one symbol. */
export function PredictionSection({ symbol }: { symbol: string }) {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [calibration, setCalibration] = useState<CalibrationDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/predictions/${symbol}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      setCalibration(data.calibration);
    }
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) return <p className="text-sm text-zinc-500">Loading predictions…</p>;

  const latest = items.find((e) => e.prediction.status === "ok")?.prediction ?? null;
  const history = items.filter((e) => e.prediction.id !== latest?.id);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">AI research</h2>
      <PredictionCard
        item={{ symbol, prediction: latest, calibration, outcome: null }}
        onRefresh={refresh}
      />
      {history.length > 0 && (
        <details className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500">
            History ({history.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {history.map((e) => (
              <li key={e.prediction.id} className="border-b border-white/5 pb-2 last:border-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-500">
                    {new Date(e.prediction.createdAt).toLocaleDateString()}
                  </span>
                  <span
                    className={
                      e.prediction.outlook === "bullish"
                        ? "text-[#22c55e]"
                        : e.prediction.outlook === "bearish"
                          ? "text-[#ef4444]"
                          : "text-zinc-300"
                    }
                  >
                    {e.prediction.outlook} {e.prediction.confidence}/10 · {e.prediction.horizonDays}d
                  </span>
                  {e.outcome && (
                    <span
                      className={`ml-auto tabular-nums ${e.outcome.directionCorrect ? "text-[#22c55e]" : "text-[#ef4444]"}`}
                    >
                      {e.outcome.directionCorrect ? "✓" : "✗"} {e.outcome.returnPct >= 0 ? "+" : ""}
                      {e.outcome.returnPct.toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{e.prediction.thesis}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
