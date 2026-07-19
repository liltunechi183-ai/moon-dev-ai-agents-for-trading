"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Bar } from "@/lib/quant/types";

export function CandlestickChart({
  bars,
  showSma20 = true,
  showSma50 = true,
}: {
  bars: Bar[];
  showSma20?: boolean;
  showSma50?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const sma20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sma50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

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
      timeScale: { timeVisible: false, secondsVisible: false },
      height: 420,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    const sma20Series = chart.addSeries(LineSeries, { color: "#38bdf8", lineWidth: 1 });
    const sma50Series = chart.addSeries(LineSeries, { color: "#facc15", lineWidth: 1 });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    sma20SeriesRef.current = sma20Series;
    sma50SeriesRef.current = sma50Series;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) chart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    if (bars.length === 0) return;

    const sorted = [...bars].sort((a, b) => a.ts - b.ts);
    // De-duplicate same-day timestamps (lightweight-charts requires strictly
    // increasing times or the series construction throws).
    const seen = new Set<number>();
    const deduped = sorted.filter((b) => {
      const key = Math.floor(b.ts / 86_400_000);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const toTime = (ts: number) => (Math.floor(ts / 86_400_000) as unknown) as UTCTimestamp;

    candleSeriesRef.current.setData(
      deduped.map((b) => ({
        time: toTime(b.ts),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );

    volumeSeriesRef.current.setData(
      deduped.map((b) => ({
        time: toTime(b.ts),
        value: b.volume,
        color: b.close >= b.open ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)",
      })),
    );

    const closes = deduped.map((b) => b.close);
    const sma = (period: number) =>
      deduped.map((b, i) => {
        if (i < period - 1) return null;
        const window = closes.slice(i - period + 1, i + 1);
        return window.reduce((a, v) => a + v, 0) / period;
      });

    if (showSma20 && sma20SeriesRef.current) {
      const s20 = sma(20);
      sma20SeriesRef.current.setData(
        deduped.map((b, i) => ({ time: toTime(b.ts), value: s20[i] ?? undefined })).filter((p) => p.value !== undefined) as {
          time: UTCTimestamp;
          value: number;
        }[],
      );
    }
    if (showSma50 && sma50SeriesRef.current) {
      const s50 = sma(50);
      sma50SeriesRef.current.setData(
        deduped.map((b, i) => ({ time: toTime(b.ts), value: s50[i] ?? undefined })).filter((p) => p.value !== undefined) as {
          time: UTCTimestamp;
          value: number;
        }[],
      );
    }

    chartRef.current?.timeScale().fitContent();
  }, [bars, showSma20, showSma50]);

  return <div ref={containerRef} className="w-full" />;
}
