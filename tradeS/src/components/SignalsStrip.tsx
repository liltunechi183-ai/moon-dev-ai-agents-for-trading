"use client";

import type { IndicatorSnapshot } from "@/lib/quant/types";
import type { Pattern } from "@/lib/quant/patterns";

function StatBlock({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "neutral" }) {
  const color = tone === "up" ? "text-[#22c55e]" : tone === "down" ? "text-[#ef4444]" : "text-zinc-200";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span className={`text-sm tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

export function SignalsStrip({
  indicators,
  patterns,
}: {
  indicators: IndicatorSnapshot;
  patterns: Pattern[];
}) {
  const price = indicators.lastClose;
  const smaTone = (sma: number | null): "up" | "down" | "neutral" =>
    price === null || sma === null ? "neutral" : price >= sma ? "up" : "down";

  const rsiZone =
    indicators.rsi14 === null
      ? "—"
      : indicators.rsi14 >= 70
        ? `${indicators.rsi14.toFixed(0)} (overbought)`
        : indicators.rsi14 <= 30
          ? `${indicators.rsi14.toFixed(0)} (oversold)`
          : indicators.rsi14.toFixed(0);

  const range =
    indicators.week52Low !== null && indicators.week52High !== null && price !== null
      ? ((price - indicators.week52Low) / (indicators.week52High - indicators.week52Low)) * 100
      : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatBlock
          label="Price vs SMA20"
          value={indicators.sma20 !== null ? indicators.sma20.toFixed(2) : "—"}
          tone={smaTone(indicators.sma20)}
        />
        <StatBlock
          label="Price vs SMA50"
          value={indicators.sma50 !== null ? indicators.sma50.toFixed(2) : "—"}
          tone={smaTone(indicators.sma50)}
        />
        <StatBlock
          label="Price vs SMA200"
          value={indicators.sma200 !== null ? indicators.sma200.toFixed(2) : "—"}
          tone={smaTone(indicators.sma200)}
        />
        <StatBlock label="RSI (14)" value={rsiZone} />
        <StatBlock
          label="MACD histogram"
          value={indicators.macdHist !== null ? indicators.macdHist.toFixed(3) : "—"}
          tone={indicators.macdHist === null ? "neutral" : indicators.macdHist >= 0 ? "up" : "down"}
        />
        <StatBlock
          label="Volume vs 20d avg"
          value={indicators.volumeRatio !== null ? `${(indicators.volumeRatio * 100).toFixed(0)}%` : "—"}
        />
        <StatBlock
          label="ATR %"
          value={indicators.atrPct !== null ? `${indicators.atrPct.toFixed(2)}%` : "—"}
        />
        <StatBlock
          label="OBV trend"
          value={indicators.obvSlope === null ? "—" : indicators.obvSlope > 0 ? "rising" : indicators.obvSlope < 0 ? "falling" : "flat"}
          tone={indicators.obvSlope === null ? "neutral" : indicators.obvSlope > 0 ? "up" : indicators.obvSlope < 0 ? "down" : "neutral"}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-zinc-500">
          <span>52-week range</span>
          <span>
            {indicators.week52Low !== null ? indicators.week52Low.toFixed(2) : "—"} —{" "}
            {indicators.week52High !== null ? indicators.week52High.toFixed(2) : "—"}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/10">
          <div
            className="h-1.5 rounded-full bg-[#38bdf8]"
            style={{ width: `${range !== null ? Math.min(100, Math.max(0, range)) : 0}%` }}
          />
        </div>
      </div>

      {patterns.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {patterns.map((p, i) => (
            <span
              key={`${p.type}-${p.ts}-${i}`}
              className="rounded-full border border-[#c084fc]/30 bg-[#c084fc]/10 px-2.5 py-1 text-xs text-[#c084fc]"
              title={p.description}
            >
              {p.type}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
