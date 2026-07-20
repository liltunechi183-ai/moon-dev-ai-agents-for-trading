"use client";

import { useEffect, useState } from "react";

interface Lesson {
  id: number;
  symbol: string;
  rootCause: string;
  evidence: string;
  ruleOfThumb: string;
  regime: string | null;
  source: "live" | "sim";
  createdAt: number;
}

const CAUSE_STYLES: Record<string, string> = {
  overconfidence: "text-amber-500",
  underconfidence: "text-amber-500",
  "regime-blindness": "text-[#c084fc]",
  "missed-catalyst": "text-[#38bdf8]",
  "bad-signal": "text-[#ef4444]",
};

export function LessonsFeed() {
  const [lessons, setLessons] = useState<Lesson[]>([]);

  useEffect(() => {
    fetch("/api/lessons")
      .then((r) => r.json())
      .then((data) => setLessons(Array.isArray(data) ? data : []));
  }, []);

  if (lessons.length === 0) return null;

  return (
    <details className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Lessons learned ({lessons.length})
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {lessons.map((l) => (
          <li key={l.id} className="border-b border-white/5 pb-2 text-xs last:border-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-200">{l.symbol}</span>
              <span className={CAUSE_STYLES[l.rootCause] ?? "text-zinc-400"}>{l.rootCause}</span>
              {l.regime && <span className="text-[10px] text-zinc-600">{l.regime}</span>}
              <span className="ml-auto text-[10px] text-zinc-600">{l.source}</span>
            </div>
            <p className="mt-0.5 text-zinc-400">{l.evidence}</p>
            <p className="mt-0.5 italic text-zinc-300">→ {l.ruleOfThumb}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
