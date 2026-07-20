"use client";

import { useCallback, useEffect, useState } from "react";
import { BotConfigPanel, type BotConfigDto } from "@/components/BotConfigPanel";
import { BotRulesPanel, type BotRuleDto } from "@/components/BotRulesPanel";
import { BotActivityFeed, type BotActivityDto } from "@/components/BotActivityFeed";
import { BotStatsPanel, type RuleStatsDto, type BotTradeDto } from "@/components/BotStatsPanel";
import { BotSuggestionsPanel, type SuggestionDto } from "@/components/BotSuggestionsPanel";

interface ConfigResponse {
  config: BotConfigDto;
  liveAckValid: boolean;
  liveAckSentence: string;
  paper: boolean;
}

export default function BotPage() {
  const [configRes, setConfigRes] = useState<ConfigResponse | null>(null);
  const [rules, setRules] = useState<BotRuleDto[]>([]);
  const [activity, setActivity] = useState<BotActivityDto[]>([]);
  const [ruleStats, setRuleStats] = useState<RuleStatsDto[]>([]);
  const [recentTrades, setRecentTrades] = useState<BotTradeDto[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionDto[]>([]);
  const [killResult, setKillResult] = useState<string | null>(null);
  const [killing, setKilling] = useState(false);

  const refresh = useCallback(async () => {
    const [cfg, r, act, stats, sug] = await Promise.all([
      fetch("/api/bot/config").then((res) => res.json()),
      fetch("/api/bot/rules").then((res) => res.json()),
      fetch("/api/bot/activity").then((res) => res.json()),
      fetch("/api/bot/stats").then((res) => res.json()),
      fetch("/api/bot/suggestions").then((res) => res.json()),
    ]);
    setConfigRes(cfg);
    setRules(Array.isArray(r) ? r : []);
    setActivity(Array.isArray(act) ? act : []);
    setRuleStats(stats.ruleStats ?? []);
    setRecentTrades(stats.recentTrades ?? []);
    setSuggestions(Array.isArray(sug) ? sug : []);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function kill() {
    if (!window.confirm("Kill the bot? This disables it and cancels its open parent orders.")) return;
    setKilling(true);
    try {
      const res = await fetch("/api/bot/kill", { method: "POST" });
      const data = await res.json();
      setKillResult(`Bot disabled. Canceled ${data.canceledOrders} open order(s).`);
      refresh();
    } finally {
      setKilling(false);
    }
  }

  const enabled = configRes?.config.enabled ?? false;
  const ruleNames = new Map(rules.map((r) => [r.id, r.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-zinc-100">Bot</h1>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            enabled
              ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]"
              : "border-white/15 bg-white/[0.04] text-zinc-400"
          }`}
        >
          {enabled ? "RUNNING (checks every 5 min in market hours)" : "STOPPED"}
        </span>
        <button
          onClick={kill}
          disabled={killing}
          className="ml-auto rounded-md border-2 border-[#ef4444] bg-[#ef4444]/15 px-5 py-2 text-sm font-bold uppercase tracking-wide text-[#ef4444] hover:bg-[#ef4444]/30 disabled:opacity-50"
        >
          {killing ? "Killing…" : "Kill switch"}
        </button>
      </div>

      {killResult && <p className="text-xs text-amber-500">{killResult}</p>}

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-zinc-400">
        The bot trades the <b className="text-amber-500">paper account</b> only, with fake money.
        It gates on the calibrated (earned) confidence, uses server-side stop-losses, and every
        decision — including blocked ones — is logged below. Research only, not financial advice.
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {configRes && (
            <BotConfigPanel
              config={configRes.config}
              liveAckSentence={configRes.liveAckSentence}
              paper={configRes.paper}
              onSaved={refresh}
            />
          )}
          <BotRulesPanel rules={rules} onChanged={refresh} />
          <BotSuggestionsPanel suggestions={suggestions} ruleNames={ruleNames} onResolved={refresh} />
          <BotStatsPanel ruleStats={ruleStats} recentTrades={recentTrades} ruleNames={ruleNames} />
        </div>
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Activity
          </h2>
          <BotActivityFeed activity={activity} />
        </div>
      </div>
    </div>
  );
}
