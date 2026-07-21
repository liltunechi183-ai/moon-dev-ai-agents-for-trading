"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface Discovery {
  id: number;
  symbol: string;
  companyName: string;
  angle: string | null;
  theme: string;
  thesis: string;
  whyOverlooked: string;
  catalysts: string[];
  risks: string[];
  sources: Array<{ title: string; url: string }>;
  confidence: number;
  horizonDays: number;
  status: "pending" | "approved" | "dismissed";
  priceAtDiscovery: number | null;
  returnPct: number | null;
  directionCorrect: boolean | null;
  benchmarkReturnPct: number | null;
}

interface Stats {
  graded: number;
  winRate: number | null;
  approvedWins: number;
  approvedGraded: number;
  dismissedWinners: number;
  avgExcessVsSpyPct: number | null;
  byAngle: Array<{ angle: string; graded: number; wins: number }>;
}

const ANGLE_STYLES: Record<string, string> = {
  "second-order": "text-[#38bdf8]",
  "primary-source": "text-[#c084fc]",
  "commodity-chain": "text-amber-500",
  dislocation: "text-[#22c55e]",
};

export function DiscoveriesPanel() {
  const { t } = useI18n();
  const [pending, setPending] = useState<Discovery[]>([]);
  const [resolved, setResolved] = useState<Discovery[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [acting, setActing] = useState<number | null>(null);
  const [scanJob, setScanJob] = useState<number | null>(null);
  const [scanElapsed, setScanElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/discoveries");
    if (res.ok) {
      const data = await res.json();
      setPending(data.pending);
      setResolved(data.resolved);
      setStats(data.stats);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (scanJob === null) return;
    const startedAt = Date.now();
    pollRef.current = setInterval(async () => {
      setScanElapsed(Math.floor((Date.now() - startedAt) / 1000));
      const job = await fetch(`/api/jobs/${scanJob}`).then((r) => r.json());
      if (job.status === "done" || job.status === "error") {
        clearInterval(pollRef.current!);
        setScanJob(null);
        setScanElapsed(0);
        refresh();
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scanJob, refresh]);

  async function scanNow() {
    const res = await fetch("/api/discoveries/scan", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setScanJob(data.jobId);
    }
  }

  async function resolve(d: Discovery, action: "approve" | "dismiss") {
    if (action === "approve" && !window.confirm(`Add ${d.symbol} to your watchlist and research it?`)) return;
    setActing(d.id);
    try {
      const res = await fetch(`/api/discoveries/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.status === 404 || res.status === 409) {
        // Someone else already resolved it — just refresh.
      }
      refresh();
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">{t("discoveries.title")}</h1>
          <p className="max-w-2xl text-xs text-zinc-500">{t("discoveries.subtitle")}</p>
        </div>
        <button
          onClick={scanNow}
          disabled={scanJob !== null}
          className="rounded-md bg-[#38bdf8]/15 px-4 py-2 text-sm font-medium text-[#38bdf8] hover:bg-[#38bdf8]/25 disabled:opacity-50"
        >
          {scanJob !== null ? t("discoveries.scanning", { s: scanElapsed }) : t("discoveries.scanNow")}
        </button>
      </div>

      {stats && stats.graded > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-zinc-400">
          {stats.graded} picks graded · {stats.winRate !== null ? (stats.winRate * 100).toFixed(0) : "—"}% went up ·
          you approved {stats.approvedWins} of {stats.approvedGraded} graded winners · {stats.dismissedWinners}{" "}
          passed-on picks went up anyway
          {stats.byAngle.length > 0 && (
            <span className="ml-2 text-zinc-600">
              (by angle: {stats.byAngle.map((a) => `${a.angle} ${a.wins}/${a.graded}`).join(", ")})
            </span>
          )}
        </div>
      )}

      {pending.length === 0 && <p className="text-sm text-zinc-500">{t("discoveries.noPending")}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {pending.map((d) => (
          <div key={d.id} className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-100">{d.symbol}</span>
                  <span className="text-xs text-zinc-500">{d.companyName}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                  {d.angle && <span className={ANGLE_STYLES[d.angle] ?? "text-zinc-400"}>{d.angle}</span>}
                  <span className="text-zinc-600">· {d.theme}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="rounded-full bg-[#38bdf8]/10 px-2 py-0.5 text-xs text-[#38bdf8]">
                  {d.confidence}/10
                </span>
                <div className="mt-1 text-[10px] text-zinc-500">
                  {d.horizonDays}d · {d.priceAtDiscovery != null ? `$${d.priceAtDiscovery.toFixed(2)}` : "—"} when found
                </div>
              </div>
            </div>

            <p className="text-sm text-zinc-300">{d.thesis}</p>
            <p className="text-xs italic text-zinc-500">Why the market missed it: {d.whyOverlooked}</p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-600">Catalysts</div>
                <ul className="list-disc pl-4 text-zinc-400">
                  {d.catalysts.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-600">Risks</div>
                <ul className="list-disc pl-4 text-zinc-400">
                  {d.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>

            {d.sources.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {d.sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-[#38bdf8] hover:underline">
                    {s.title}
                  </a>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => resolve(d, "approve")}
                disabled={acting === d.id}
                className="rounded-md bg-[#22c55e]/15 px-3 py-1.5 text-xs font-medium text-[#22c55e] disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => resolve(d, "dismiss")}
                disabled={acting === d.id}
                className="rounded-md bg-white/[0.05] px-3 py-1.5 text-xs text-zinc-400 disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      {resolved.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent history</h2>
          <ul className="flex flex-col gap-1.5">
            {resolved.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-xs"
              >
                <Link href={`/stock/${d.symbol}`} className="font-medium text-zinc-200 hover:underline">
                  {d.symbol}
                </Link>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    d.status === "approved" ? "bg-[#22c55e]/10 text-[#22c55e]" : "bg-white/[0.05] text-zinc-500"
                  }`}
                >
                  {d.status}
                </span>
                {d.returnPct !== null && (
                  <span className={`tabular-nums ${d.directionCorrect ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                    {d.returnPct >= 0 ? "+" : ""}
                    {d.returnPct.toFixed(1)}%
                    {d.benchmarkReturnPct !== null && (
                      <span className="ml-1 text-zinc-600">(SPY {d.benchmarkReturnPct >= 0 ? "+" : ""}{d.benchmarkReturnPct.toFixed(1)}%)</span>
                    )}
                  </span>
                )}
                {d.status === "dismissed" && d.directionCorrect && (
                  <span className="ml-auto text-[10px] text-amber-500">went up anyway after you passed</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
