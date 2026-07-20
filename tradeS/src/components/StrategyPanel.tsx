"use client";

import { Scorecard, type ScorecardDto } from "./Scorecard";

interface StrategyData {
  active: { version: number; changeSummary: string; fullText: string; quantText: string };
  testing: {
    version: number;
    tier: string;
    changeSummary: string;
    rationale: string;
    scorecard: ScorecardDto | null;
    pairs: number;
    minPairs: number;
  } | null;
  timeline: Array<{
    version: number;
    parentVersion: number | null;
    status: string;
    tier: string;
    changeSummary: string;
    createdBy: string;
    createdAt: number;
  }>;
  budget: {
    used: number;
    target: number;
    pctUsed: number;
    sheddingShadows: boolean;
    sheddingGauntlet: boolean;
    sheddingPostmortems: boolean;
  };
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-[#22c55e]/15 text-[#22c55e]",
  testing: "bg-[#38bdf8]/15 text-[#38bdf8]",
  proposed: "bg-amber-500/15 text-amber-500",
  retired: "bg-white/[0.05] text-zinc-500",
  rejected: "bg-[#ef4444]/10 text-[#ef4444]",
};

export function StrategyPanel({ data }: { data: StrategyData }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Active strategy</h2>
          <span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 text-xs text-[#22c55e]">v{data.active.version}</span>
        </div>
        <p className="text-sm text-zinc-300">{data.active.changeSummary}</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-zinc-500">Read the full playbook</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded bg-black/30 p-3 text-xs text-zinc-400">
            {data.active.fullText}
          </pre>
        </details>
      </div>

      {data.testing ? (
        <div className="rounded-lg border border-[#38bdf8]/20 bg-white/[0.02] p-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Challenger under test</h2>
            <span className="rounded-full bg-[#38bdf8]/15 px-2 py-0.5 text-xs text-[#38bdf8]">
              v{data.testing.version} · {data.testing.tier}
            </span>
          </div>
          <p className="mb-2 text-sm text-zinc-300">{data.testing.changeSummary}</p>
          <p className="mb-3 text-xs text-zinc-500">{data.testing.rationale}</p>
          <Scorecard scorecard={data.testing.scorecard} pairs={data.testing.pairs} minPairs={data.testing.minPairs} />
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500">
          No challenger under test right now. The strategist proposes one weekly when enough lessons
          have piled up.
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Version timeline</h2>
        <ul className="flex flex-col gap-1.5">
          {data.timeline.map((v) => (
            <li key={v.version} className="flex items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLES[v.status] ?? "text-zinc-400"}`}>
                v{v.version} {v.status}
              </span>
              <span className="flex-1 text-zinc-400">{v.changeSummary}</span>
              <span className="text-[10px] text-zinc-600">{v.createdBy}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Daily agent budget</h2>
          <span className="text-xs tabular-nums text-zinc-400">
            {data.budget.used} / {data.budget.target} runs
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/10">
          <div
            className={`h-1.5 rounded-full ${data.budget.pctUsed >= 1 ? "bg-[#ef4444]" : "bg-[#22c55e]"}`}
            style={{ width: `${Math.min(100, data.budget.pctUsed * 100)}%` }}
          />
        </div>
        <div className="mt-2 flex gap-3 text-[10px] text-zinc-500">
          <span>{data.budget.sheddingShadows ? "⏸ shadows shed" : "▶ shadows"}</span>
          <span>{data.budget.sheddingGauntlet ? "⏸ gauntlet shed" : "▶ gauntlet"}</span>
          <span>{data.budget.sheddingPostmortems ? "⏸ post-mortems shed" : "▶ post-mortems"}</span>
        </div>
      </div>
    </div>
  );
}
