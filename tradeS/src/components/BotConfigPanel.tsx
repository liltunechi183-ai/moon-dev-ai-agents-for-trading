"use client";

import { useState } from "react";

export interface BotConfigDto {
  enabled: boolean;
  maxPositionUsd: number;
  maxTotalExposureUsd: number;
  maxDailyLossUsd: number;
  maxOrdersPerDay: number;
  cooldownMinutes: number;
  minConfidence: number;
  liveAck: string;
  budgetUsd: number;
  cashReservePct: number;
  maxSlicePct: number;
}

const NUMBER_FIELDS: Array<{ key: keyof BotConfigDto; label: string; step?: string }> = [
  { key: "budgetUsd", label: "Bot budget ($)" },
  { key: "maxPositionUsd", label: "Max per stock ($)" },
  { key: "maxTotalExposureUsd", label: "Max total exposure ($)" },
  { key: "maxDailyLossUsd", label: "Daily loss halt ($)" },
  { key: "maxOrdersPerDay", label: "Max orders / day" },
  { key: "cooldownMinutes", label: "Per-symbol cooldown (min)" },
  { key: "cashReservePct", label: "Cash reserve (0-0.9)", step: "0.05" },
  { key: "maxSlicePct", label: "Max slice of budget (0-1)", step: "0.05" },
];

export function BotConfigPanel({
  config,
  liveAckSentence,
  paper,
  onSaved,
}: {
  config: BotConfigDto;
  liveAckSentence: string;
  paper: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<BotConfigDto>(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(patch: Partial<BotConfigDto>) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/bot/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("save failed");
      setMessage("Saved.");
      onSaved();
    } catch {
      setMessage("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Bot config</h2>
        <button
          onClick={() => save({ enabled: !config.enabled })}
          disabled={saving}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            config.enabled ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-white/[0.06] text-zinc-400"
          }`}
        >
          {config.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {NUMBER_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs text-zinc-500">
            {f.label}
            <input
              type="number"
              step={f.step ?? "any"}
              value={String(draft[f.key])}
              onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
              className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
            />
          </label>
        ))}
      </div>
      <button
        onClick={() => {
          const { enabled: _enabled, liveAck: _liveAck, ...numbers } = draft;
          save(numbers);
        }}
        disabled={saving}
        className="self-start rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-white/15 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save limits"}
      </button>

      <details className="rounded-md border border-[#ef4444]/20 bg-[#ef4444]/5 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[#ef4444]">
          Live trading unlock (danger)
        </summary>
        <p className="mt-2 text-xs text-zinc-400">
          Live trading needs all three: <code>ALPACA_ALLOW_LIVE=true</code> in the environment,
          separate live API keys in use, and this exact sentence typed below. Currently running in{" "}
          <b>{paper ? "paper" : "LIVE"}</b> mode.
        </p>
        <p className="mt-2 rounded bg-black/30 p-2 text-xs text-zinc-300">{liveAckSentence}</p>
        <input
          value={draft.liveAck}
          onChange={(e) => setDraft({ ...draft, liveAck: e.target.value })}
          placeholder="Type the sentence exactly"
          className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
        />
        <button
          onClick={() => save({ liveAck: draft.liveAck })}
          disabled={saving}
          className="mt-2 rounded-md bg-[#ef4444]/15 px-3 py-1.5 text-xs font-medium text-[#ef4444] disabled:opacity-50"
        >
          Save acknowledgment
        </button>
      </details>

      {message && <p className="text-xs text-zinc-500">{message}</p>}
    </div>
  );
}
