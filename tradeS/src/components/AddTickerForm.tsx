"use client";

import { useState } from "react";

export function AddTickerForm({ onAdded }: { onAdded: () => void }) {
  const [symbol, setSymbol] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) throw new Error("Could not add ticker");
      setSymbol("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Ticker</label>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="TSLA or TD.TO"
          required
          className="w-40 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[#38bdf8]/15 px-3 py-1.5 text-sm font-medium text-[#38bdf8] hover:bg-[#38bdf8]/25 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add to watchlist"}
      </button>
      {error && <span className="text-xs text-[#ef4444]">{error}</span>}
    </form>
  );
}
