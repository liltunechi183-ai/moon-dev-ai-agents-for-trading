"use client";

import { useState } from "react";

export interface SuggestionDto {
  id: number;
  ruleId: number | null;
  ruleVersion: number | null;
  suggestedCondition: unknown;
  suggestedAction: unknown;
  summary: string;
  evidence: unknown;
  createdAt: number;
}

export function BotSuggestionsPanel({
  suggestions,
  ruleNames,
  onResolved,
}: {
  suggestions: SuggestionDto[];
  ruleNames: Map<number, string>;
  onResolved: () => void;
}) {
  const [acting, setActing] = useState<number | null>(null);

  async function resolve(id: number, action: "apply" | "dismiss") {
    setActing(id);
    try {
      await fetch(`/api/bot/suggestions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      onResolved();
    } finally {
      setActing(null);
    }
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-500">
        Rule tuning suggestions ({suggestions.length})
      </h2>
      <p className="text-xs text-zinc-500">
        The advisor never changes a rule on its own. Review the evidence and decide.
      </p>
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <li key={s.id} className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs">
            <div className="mb-1 text-zinc-300">
              {s.ruleId != null && (
                <b className="mr-1">{ruleNames.get(s.ruleId) ?? `rule ${s.ruleId}`}</b>
              )}
              {s.summary}
            </div>
            <details className="mb-2">
              <summary className="cursor-pointer text-[10px] text-zinc-500">Evidence</summary>
              <pre className="mt-1 overflow-x-auto rounded bg-black/30 p-2 text-[10px] text-zinc-400">
                {JSON.stringify(s.evidence, null, 2)}
              </pre>
            </details>
            <div className="flex gap-2">
              <button
                onClick={() => resolve(s.id, "apply")}
                disabled={acting === s.id}
                className="rounded-md bg-[#22c55e]/15 px-3 py-1 text-xs font-medium text-[#22c55e] disabled:opacity-50"
              >
                Apply
              </button>
              <button
                onClick={() => resolve(s.id, "dismiss")}
                disabled={acting === s.id}
                className="rounded-md bg-white/[0.05] px-3 py-1 text-xs text-zinc-400 disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
