"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ConfidenceMeter } from "./ConfidenceMeter";
import type { PredictionListItem } from "@/lib/predictions-types";

const OUTLOOK_STYLES: Record<string, string> = {
  bullish: "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]",
  bearish: "border-[#ef4444]/30 bg-[#ef4444]/10 text-[#ef4444]",
  neutral: "border-white/15 bg-white/[0.04] text-zinc-300",
};

export function PredictionCard({ item, onRefresh }: { item: PredictionListItem; onRefresh: () => void }) {
  const { symbol, prediction, calibration } = item;
  const [jobId, setJobId] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (jobId === null) return;
    const startedAt = Date.now();
    pollRef.current = setInterval(async () => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) return;
      const job = await res.json();
      if (job.status === "done" || job.status === "error") {
        clearInterval(pollRef.current!);
        setJobId(null);
        setElapsed(0);
        onRefresh();
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, onRefresh]);

  async function requestResearch() {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    if (res.ok) {
      const data = await res.json();
      setJobId(data.jobId);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <Link href={`/stock/${symbol}`} className="font-semibold text-zinc-100 hover:underline">
          {symbol}
        </Link>
        {prediction && prediction.status === "ok" && (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${OUTLOOK_STYLES[prediction.outlook]}`}
          >
            {prediction.outlook} · {prediction.horizonDays}d
          </span>
        )}
        {prediction && prediction.status === "error" && (
          <span className="rounded-full border border-[#ef4444]/30 bg-[#ef4444]/10 px-2.5 py-0.5 text-xs text-[#ef4444]">
            analysis failed
          </span>
        )}
      </div>

      {prediction && prediction.status === "ok" ? (
        <>
          <ConfidenceMeter
            raw={prediction.confidence}
            effective={calibration?.effective ?? prediction.confidence}
            capped={calibration?.capped ?? false}
          />
          {calibration && calibration.segment.winRate !== null && (
            <p className="text-xs text-zinc-500">
              Similar calls were right {(calibration.segment.winRate * 100).toFixed(0)}% of the time
              (n={calibration.segment.samples})
            </p>
          )}
          <p className="text-sm leading-relaxed text-zinc-300">{prediction.thesis}</p>
          {prediction.risks.length > 0 && (
            <details className="text-sm text-zinc-400">
              <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500">
                Risks ({prediction.risks.length})
              </summary>
              <ul className="mt-1 list-disc pl-5">
                {prediction.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </details>
          )}
          {prediction.catalysts.length > 0 && (
            <details className="text-sm text-zinc-400">
              <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500">
                Catalysts ({prediction.catalysts.length})
              </summary>
              <ul className="mt-1 list-disc pl-5">
                {prediction.catalysts.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </details>
          )}
          {prediction.sources.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500">
                Sources ({prediction.sources.length})
              </summary>
              <ul className="mt-1 list-disc pl-5">
                {prediction.sources.map((s, i) => (
                  <li key={i}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#38bdf8] hover:underline"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-[10px] text-zinc-600">
            {new Date(prediction.createdAt).toLocaleString()} · v{prediction.algoVersion ?? 1}
            {prediction.regime ? ` · ${prediction.regime}` : ""} · research only, not financial advice
          </p>
        </>
      ) : (
        <p className="text-sm text-zinc-500">No prediction yet.</p>
      )}

      <button
        onClick={requestResearch}
        disabled={jobId !== null}
        className="self-start rounded-md bg-[#38bdf8]/15 px-3 py-1.5 text-xs font-medium text-[#38bdf8] hover:bg-[#38bdf8]/25 disabled:opacity-60"
      >
        {jobId !== null ? `Researching… ${elapsed}s` : prediction ? "Re-run research" : "Run research"}
      </button>
    </div>
  );
}
