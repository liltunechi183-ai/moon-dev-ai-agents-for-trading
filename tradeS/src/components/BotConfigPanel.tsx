"use client";

import { useState } from "react";
import {
  BOT_CONFIG_FIELDS,
  toDisplay,
  toStored,
  validateDraft,
  type NumericConfigKey,
} from "@/lib/bot/config-fields";

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
  // Kept in DISPLAY units (percents as percents), converted on save.
  const [draft, setDraft] = useState<Record<NumericConfigKey, number>>(() =>
    Object.fromEntries(
      BOT_CONFIG_FIELDS.map((f) => [f.key, toDisplay(config[f.key], f)]),
    ) as Record<NumericConfigKey, number>,
  );
  const [errors, setErrors] = useState<string[]>([]);
  // Separate from the numeric draft: it saves on its own button and must not
  // ride along with the limits.
  const [liveAckDraft, setLiveAckDraft] = useState(config.liveAck);
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
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const fieldErrors = body?.error?.fieldErrors as Record<string, string[]> | undefined;
        const detail = fieldErrors
          ? Object.entries(fieldErrors)
              .map(([field, msgs]) => `${field}: ${msgs.join(", ")}`)
              .join(" · ")
          : `HTTP ${res.status}`;
        throw new Error(detail);
      }
      setMessage("Saved.");
      onSaved();
    } catch (err) {
      setMessage(`Could not save — ${err instanceof Error ? err.message : String(err)}`);
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
        {BOT_CONFIG_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs text-zinc-500">
            {f.label}
            <input
              type="number"
              min={f.min}
              max={f.max}
              step={f.step}
              value={String(draft[f.key])}
              onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
              className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
            />
          </label>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="rounded-md border border-[#ef4444]/30 bg-[#ef4444]/5 p-2 text-xs text-[#ef4444]">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button
        onClick={() => {
          // Catch the mistake here rather than letting one bad field 400 the
          // whole form and discard the changes that were fine.
          const found = validateDraft(draft);
          setErrors(found);
          if (found.length > 0) {
            setMessage(null);
            return;
          }
          const patch = Object.fromEntries(
            BOT_CONFIG_FIELDS.map((f) => [f.key, toStored(draft[f.key], f)]),
          );
          save(patch);
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
          value={liveAckDraft}
          onChange={(e) => setLiveAckDraft(e.target.value)}
          placeholder="Type the sentence exactly"
          className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100"
        />
        <button
          onClick={() => save({ liveAck: liveAckDraft })}
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
