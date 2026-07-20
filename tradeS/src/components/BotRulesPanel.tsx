"use client";

import { useState } from "react";

export interface BotRuleDto {
  id: number;
  name: string;
  enabled: boolean;
  condition: {
    outlook: "bullish" | "neutral" | "bearish";
    minConfidence: number;
    requiredPatterns?: string[];
    maxRsi?: number;
    minRsi?: number;
    symbolScope: "all" | string[];
  };
  action: {
    side: "buy" | "sell";
    notionalUsd: number;
    orderType: "market";
    stopLossPct: number;
    takeProfitPct?: number;
  };
  version: number;
}

const PATTERN_OPTIONS = ["breakout", "pullback", "golden-cross", "death-cross"];

export function BotRulesPanel({ rules, onChanged }: { rules: BotRuleDto[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [outlook, setOutlook] = useState<"bullish" | "bearish" | "neutral">("bullish");
  const [minConfidence, setMinConfidence] = useState("7");
  const [pattern, setPattern] = useState<string>("");
  const [stopLossPct, setStopLossPct] = useState("5");
  const [takeProfitPct, setTakeProfitPct] = useState("");
  const [busy, setBusy] = useState(false);

  async function createRule() {
    setBusy(true);
    try {
      await fetch("/api/bot/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:
            name ||
            `${outlook} ≥${minConfidence}${pattern ? ` + ${pattern}` : ""} → ${side}`,
          condition: {
            outlook,
            minConfidence: Number(minConfidence),
            ...(pattern ? { requiredPatterns: [pattern] } : {}),
            symbolScope: "all",
          },
          action: {
            side,
            notionalUsd: 500,
            orderType: "market",
            stopLossPct: Number(stopLossPct),
            ...(takeProfitPct ? { takeProfitPct: Number(takeProfitPct) } : {}),
          },
        }),
      });
      setAdding(false);
      setName("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(rule: BotRuleDto) {
    await fetch(`/api/bot/rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    onChanged();
  }

  async function deleteRule(rule: BotRuleDto) {
    await fetch(`/api/bot/rules/${rule.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Rules</h2>

      {rules.length === 0 && <p className="text-sm text-zinc-500">No rules yet.</p>}

      <ul className="flex flex-col gap-2">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className="flex items-center gap-3 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2"
          >
            <button
              onClick={() => toggleRule(rule)}
              className={`h-4 w-8 rounded-full transition-colors ${
                rule.enabled ? "bg-[#22c55e]/60" : "bg-white/10"
              }`}
              title={rule.enabled ? "Enabled" : "Disabled"}
            >
              <span
                className={`block h-3 w-3 rounded-full bg-white transition-transform ${
                  rule.enabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
            <div className="flex-1">
              <div className="text-sm text-zinc-100">
                {rule.name} <span className="text-[10px] text-zinc-500">v{rule.version}</span>
              </div>
              <div className="text-xs text-zinc-500">
                {rule.condition.outlook} ≥{rule.condition.minConfidence}/10
                {rule.condition.requiredPatterns?.length
                  ? ` + ${rule.condition.requiredPatterns.join(",")}`
                  : ""}{" "}
                → {rule.action.side} with {rule.action.stopLossPct}% stop
                {rule.action.takeProfitPct ? ` / ${rule.action.takeProfitPct}% target` : ""}
              </div>
            </div>
            <button onClick={() => deleteRule(rule)} className="text-xs text-zinc-600 hover:text-[#ef4444]">
              Delete
            </button>
          </li>
        ))}
      </ul>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="self-start rounded-md bg-[#38bdf8]/15 px-3 py-1.5 text-xs font-medium text-[#38bdf8]"
        >
          Add rule
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-white/10 p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
          />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-1 text-zinc-500">
              Side
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as "buy" | "sell")}
                className="rounded-md border border-white/10 bg-[#0a0e14] px-2 py-1.5 text-sm text-zinc-100"
              >
                <option value="buy">buy</option>
                <option value="sell">sell</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-zinc-500">
              Requires outlook
              <select
                value={outlook}
                onChange={(e) => setOutlook(e.target.value as typeof outlook)}
                className="rounded-md border border-white/10 bg-[#0a0e14] px-2 py-1.5 text-sm text-zinc-100"
              >
                <option value="bullish">bullish</option>
                <option value="bearish">bearish</option>
                <option value="neutral">neutral</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-zinc-500">
              Min confidence (effective)
              <input
                type="number"
                min="0"
                max="10"
                value={minConfidence}
                onChange={(e) => setMinConfidence(e.target.value)}
                className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-zinc-500">
              Required pattern
              <select
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="rounded-md border border-white/10 bg-[#0a0e14] px-2 py-1.5 text-sm text-zinc-100"
              >
                <option value="">none</option>
                {PATTERN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-zinc-500">
              Stop-loss %
              <input
                type="number"
                min="0.5"
                max="50"
                value={stopLossPct}
                onChange={(e) => setStopLossPct(e.target.value)}
                className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-zinc-500">
              Take-profit % (optional)
              <input
                type="number"
                min="0.5"
                value={takeProfitPct}
                onChange={(e) => setTakeProfitPct(e.target.value)}
                className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createRule}
              disabled={busy}
              className="rounded-md bg-[#22c55e]/15 px-3 py-1.5 text-xs font-medium text-[#22c55e] disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-md bg-white/[0.05] px-3 py-1.5 text-xs text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
