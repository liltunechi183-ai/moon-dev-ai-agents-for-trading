"use client";

import { useState } from "react";

export function HoldingForm({ onAdded }: { onAdded: () => void }) {
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          shares: Number(shares),
          costBasis: Number(costBasis),
        }),
      });
      if (!res.ok) throw new Error("Could not add holding");
      setSymbol("");
      setShares("");
      setCostBasis("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Symbol</label>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="AAPL"
          required
          className="w-28 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Shares</label>
        <input
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          type="number"
          step="any"
          min="0"
          required
          className="w-24 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Cost basis / share</label>
        <input
          value={costBasis}
          onChange={(e) => setCostBasis(e.target.value)}
          type="number"
          step="any"
          min="0"
          required
          className="w-32 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[#22c55e]/15 px-3 py-1.5 text-sm font-medium text-[#22c55e] hover:bg-[#22c55e]/25 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add holding"}
      </button>
      {error && <span className="text-xs text-[#ef4444]">{error}</span>}
    </form>
  );
}
