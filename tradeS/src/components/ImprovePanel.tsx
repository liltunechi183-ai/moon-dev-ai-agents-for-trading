"use client";

import { useState } from "react";

/** "Speed up improvement" — run a cycle or resolve the challenger on demand. */
export function ImprovePanel({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState<null | "cycle" | "resolve">(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: "cycle" | "resolve") {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const { jobId } = await res.json();
      // Poll the job to completion.
      const poll = setInterval(async () => {
        const jr = await fetch(`/api/jobs/${jobId}`).then((r) => r.json());
        if (jr.status === "done" || jr.status === "error") {
          clearInterval(poll);
          setBusy(null);
          setMessage(
            jr.status === "error"
              ? `Failed: ${jr.error}`
              : action === "resolve"
                ? jr.result?.promoted
                  ? `Promoted! ${jr.result.reason}`
                  : `Resolved: ${jr.result?.reason ?? "no change"}`
                : "Cycle complete.",
          );
          onDone();
        }
      }, 4000);
    } catch {
      setBusy(null);
      setMessage("Could not start.");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Speed up improvement</h2>
      <p className="text-xs text-zinc-500">
        Normally this happens on a schedule. Run it now to burn through a full cycle (research sweep,
        sims, gauntlet, weekly agents) or grind the current challenger to a verdict.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => run("cycle")}
          disabled={busy !== null}
          className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-white/15 disabled:opacity-50"
        >
          {busy === "cycle" ? "Running cycle…" : "Run cycle now"}
        </button>
        <button
          onClick={() => run("resolve")}
          disabled={busy !== null}
          className="rounded-md bg-[#38bdf8]/15 px-3 py-1.5 text-xs font-medium text-[#38bdf8] hover:bg-[#38bdf8]/25 disabled:opacity-50"
        >
          {busy === "resolve" ? "Resolving…" : "Resolve challenger"}
        </button>
      </div>
      {message && <p className="text-xs text-zinc-400">{message}</p>}
    </div>
  );
}
