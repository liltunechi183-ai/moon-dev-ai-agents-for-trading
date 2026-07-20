"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

export interface EquityPoint {
  ts: number;
  equity: number;
}

export function EquityCurve({ points }: { points: EquityPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0e14" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      height: 220,
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#22c55e",
      topColor: "rgba(34,197,94,0.35)",
      bottomColor: "rgba(34,197,94,0.02)",
      lineWidth: 2,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      if (entries[0]) chart.applyOptions({ width: entries[0].contentRect.width });
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || points.length === 0) return;
    // De-duplicate same-second timestamps — two snapshots in the same second
    // crash the series construction (times must be strictly increasing).
    const sorted = [...points].sort((a, b) => a.ts - b.ts);
    const seen = new Set<number>();
    const data: { time: UTCTimestamp; value: number }[] = [];
    for (const p of sorted) {
      const sec = Math.floor(p.ts / 1000);
      if (seen.has(sec)) continue;
      seen.add(sec);
      data.push({ time: sec as UTCTimestamp, value: p.equity });
    }
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No equity history yet — the worker snapshots the account every 15 minutes during market
        hours.
      </p>
    );
  }
  return <div ref={containerRef} className="w-full" />;
}
