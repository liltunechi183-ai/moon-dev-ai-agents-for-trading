"use client";

import type { AccuracyDto } from "@/lib/predictions-types";

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(0)}%`;
}

function BucketTable({ title, rows }: { title: string; rows: AccuracyDto["byOutlook"] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{title}</h3>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-white/5 last:border-0">
              <td className="py-1 pr-2 text-zinc-300">{r.label}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-zinc-400">n={r.samples}</td>
              <td
                className={`py-1 text-right tabular-nums ${
                  r.winRate >= 0.5 ? "text-[#22c55e]" : "text-[#ef4444]"
                }`}
              >
                {(r.winRate * 100).toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccuracyPanel({ stats }: { stats: AccuracyDto }) {
  if (stats.graded === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500">
        No graded predictions yet. Accuracy appears here once predictions reach their horizon —
        until then, every confidence number is just the model&apos;s self-report.
      </div>
    );
  }

  const beatBull =
    stats.winRate !== null && stats.baselines.alwaysBullishWinRate !== null
      ? stats.winRate > stats.baselines.alwaysBullishWinRate
      : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Graded calls</div>
          <div className="text-lg font-semibold tabular-nums text-zinc-100">{stats.graded}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Win rate</div>
          <div className="text-lg font-semibold tabular-nums text-zinc-100">{pct(stats.winRate)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Avg return</div>
          <div className="text-lg font-semibold tabular-nums text-zinc-100">
            {stats.avgReturnPct === null ? "—" : `${stats.avgReturnPct.toFixed(1)}%`}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Avg vs SPY</div>
          <div
            className={`text-lg font-semibold tabular-nums ${
              stats.avgExcessVsSpyPct === null
                ? "text-zinc-100"
                : stats.avgExcessVsSpyPct >= 0
                  ? "text-[#22c55e]"
                  : "text-[#ef4444]"
            }`}
          >
            {stats.avgExcessVsSpyPct === null ? "—" : `${stats.avgExcessVsSpyPct >= 0 ? "+" : ""}${stats.avgExcessVsSpyPct.toFixed(1)}%`}
          </div>
        </div>
      </div>

      <div className="text-xs text-zinc-400">
        <span className="mr-2 text-[10px] uppercase tracking-wide text-zinc-500">Is it real skill?</span>
        Always-bullish on the same windows: {pct(stats.baselines.alwaysBullishWinRate)} · 50-day
        momentum: {pct(stats.baselines.momentumWinRate)}
        {beatBull !== null && (
          <span className={beatBull ? "ml-2 text-[#22c55e]" : "ml-2 text-amber-500"}>
            {beatBull ? "Beating the dumb bull rule." : "Not yet beating the dumb bull rule."}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <BucketTable title="By outlook" rows={stats.byOutlook} />
        <BucketTable title="By confidence" rows={stats.byConfidence} />
        <BucketTable title="By strategy version" rows={stats.byVersion} />
        <BucketTable title="By regime" rows={stats.byRegime} />
      </div>
    </div>
  );
}
