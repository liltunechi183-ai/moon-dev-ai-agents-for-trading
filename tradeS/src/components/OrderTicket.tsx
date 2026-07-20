"use client";

import { useEffect, useState } from "react";

export interface TicketPrefill {
  symbol: string;
  side: "buy" | "sell";
  qty?: number;
}

export function OrderTicket({
  prefill,
  onSubmitted,
}: {
  prefill: TicketPrefill | null;
  onSubmitted: () => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [sizeMode, setSizeMode] = useState<"shares" | "dollars">("shares");
  const [qty, setQty] = useState("");
  const [notional, setNotional] = useState("");
  const [type, setType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setSymbol(prefill.symbol);
    setSide(prefill.side);
    if (prefill.qty != null) {
      setSizeMode("shares");
      setQty(String(prefill.qty));
    }
    setConfirming(false);
    setMessage(null);
  }, [prefill]);

  async function submit() {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/trade/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          type,
          ...(sizeMode === "shares" ? { qty: Number(qty) } : { notional: Number(notional) }),
          ...(type === "limit" ? { limitPrice: Number(limitPrice) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "order rejected");
      setMessage(`Order submitted (${data.status}).`);
      setQty("");
      setNotional("");
      setConfirming(false);
      onSubmitted();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const sizeOk = sizeMode === "shares" ? Number(qty) > 0 : Number(notional) > 0;
  const ready = symbol.trim().length > 0 && sizeOk && (type === "market" || Number(limitPrice) > 0);

  const summary = `${side.toUpperCase()} ${
    sizeMode === "shares" ? `${qty} share(s)` : `$${notional}`
  } of ${symbol.toUpperCase()} at ${type === "market" ? "market" : `limit ${limitPrice}`}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Order ticket</h2>

      <div className="flex gap-2">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
              side === s
                ? s === "buy"
                  ? "bg-[#22c55e]/20 text-[#22c55e]"
                  : "bg-[#ef4444]/20 text-[#ef4444]"
                : "bg-white/[0.04] text-zinc-400"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <input
        value={symbol}
        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        placeholder="Symbol (e.g. AAPL)"
        className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
      />

      <div className="flex gap-2">
        {(["shares", "dollars"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setSizeMode(m)}
            className={`flex-1 rounded-md px-2 py-1 text-xs capitalize ${
              sizeMode === m ? "bg-white/10 text-zinc-100" : "bg-white/[0.03] text-zinc-500"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      {sizeMode === "shares" ? (
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          type="number"
          step="any"
          min="0"
          placeholder="Shares"
          className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
        />
      ) : (
        <input
          value={notional}
          onChange={(e) => setNotional(e.target.value)}
          type="number"
          step="any"
          min="0"
          placeholder="Dollars"
          className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
        />
      )}

      <div className="flex gap-2">
        {(["market", "limit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 rounded-md px-2 py-1 text-xs capitalize ${
              type === t ? "bg-white/10 text-zinc-100" : "bg-white/[0.03] text-zinc-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {type === "limit" && (
        <input
          value={limitPrice}
          onChange={(e) => setLimitPrice(e.target.value)}
          type="number"
          step="any"
          min="0"
          placeholder="Limit price"
          className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
        />
      )}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={!ready}
          className="rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/15 disabled:opacity-40"
        >
          Review order
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs text-zinc-300">{summary}</p>
          <p className="text-[10px] text-amber-500">Paper account — fake money, real market data.</p>
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={submitting}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                side === "buy" ? "bg-[#22c55e]/20 text-[#22c55e]" : "bg-[#ef4444]/20 text-[#ef4444]"
              } disabled:opacity-50`}
            >
              {submitting ? "Submitting…" : "Confirm"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md bg-white/[0.05] px-3 py-1.5 text-sm text-zinc-400"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {message && <p className="text-xs text-zinc-400">{message}</p>}
    </div>
  );
}
