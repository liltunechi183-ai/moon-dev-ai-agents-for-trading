"use client";

import { useCallback, useEffect, useState } from "react";
import { BotConfigPanel, type BotConfigDto } from "@/components/BotConfigPanel";
import { BotRulesPanel, type BotRuleDto } from "@/components/BotRulesPanel";
import { BotActivityFeed, type BotActivityDto } from "@/components/BotActivityFeed";
import { BotStatsPanel, type RuleStatsDto, type BotTradeDto } from "@/components/BotStatsPanel";
import { BotSuggestionsPanel, type SuggestionDto } from "@/components/BotSuggestionsPanel";
import { useI18n } from "@/lib/i18n/provider";

/** Fetch JSON, treating a non-2xx as the failure it is — `res.json()` on an
 * error page either throws or, worse, succeeds with something meaningless. */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return (await res.json()) as T;
}

interface ConfigResponse {
  config: BotConfigDto;
  liveAckValid: boolean;
  liveAckSentence: string;
  paper: boolean;
}

export default function BotPage() {
  const { t } = useI18n();
  const [configRes, setConfigRes] = useState<ConfigResponse | null>(null);
  const [rules, setRules] = useState<BotRuleDto[]>([]);
  const [activity, setActivity] = useState<BotActivityDto[]>([]);
  const [ruleStats, setRuleStats] = useState<RuleStatsDto[]>([]);
  const [recentTrades, setRecentTrades] = useState<BotTradeDto[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionDto[]>([]);
  const [killResult, setKillResult] = useState<string | null>(null);
  const [killing, setKilling] = useState(false);
  /**
   * Whether this page is currently in touch with the worker's database.
   *
   * This distinction is not cosmetic. Every panel below reads from state
   * that starts empty, and an empty state here is indistinguishable from a
   * true one: no config renders the badge as STOPPED, no rules renders "no
   * rules yet", no activity renders "no activity yet". A page that cannot
   * reach the server therefore used to render a complete, confident, and
   * entirely false picture of a halted bot — which is the one lie this
   * page must never tell about a system that handles money.
   */
  const [contact, setContact] = useState<"loading" | "ok" | "lost">("loading");

  const refresh = useCallback(async () => {
    // allSettled, not all: one endpoint erroring must not blank the other
    // four. A stats query that fails is a missing panel, not a stopped bot.
    const [cfg, r, act, stats, sug] = await Promise.allSettled([
      getJson<ConfigResponse>("/api/bot/config"),
      getJson<BotRuleDto[]>("/api/bot/rules"),
      getJson<BotActivityDto[]>("/api/bot/activity"),
      getJson<{ ruleStats?: RuleStatsDto[]; recentTrades?: BotTradeDto[] }>("/api/bot/stats"),
      getJson<SuggestionDto[]>("/api/bot/suggestions"),
    ]);

    if (cfg.status === "fulfilled") setConfigRes(cfg.value);
    if (r.status === "fulfilled") setRules(Array.isArray(r.value) ? r.value : []);
    if (act.status === "fulfilled") setActivity(Array.isArray(act.value) ? act.value : []);
    if (stats.status === "fulfilled") {
      setRuleStats(stats.value.ruleStats ?? []);
      setRecentTrades(stats.value.recentTrades ?? []);
    }
    if (sug.status === "fulfilled") setSuggestions(Array.isArray(sug.value) ? sug.value : []);

    // The config call is the one that decides whether the header may claim
    // anything at all about the bot's state.
    if (cfg.status === "rejected") {
      console.error("[bot page] could not reach the server:", cfg.reason);
      setContact("lost");
    } else {
      setContact("ok");
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function kill() {
    if (!window.confirm(t("bot.killConfirm"))) return;
    setKilling(true);
    try {
      const res = await fetch("/api/bot/kill", { method: "POST" });
      const data = await res.json();
      setKillResult(t("bot.killResult", { n: data.canceledOrders }));
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
        <h1 className="text-lg font-semibold text-zinc-100">{t("bot.title")}</h1>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            contact !== "ok"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
              : enabled
                ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]"
                : "border-white/15 bg-white/[0.04] text-zinc-400"
          }`}
        >
          {contact === "loading"
            ? t("bot.checking")
            : contact === "lost"
              ? t("bot.noContact")
              : enabled
                ? t("bot.running")
                : t("bot.stopped")}
        </span>
        <button
          onClick={kill}
          disabled={killing}
          className="ml-auto rounded-md border-2 border-[#ef4444] bg-[#ef4444]/15 px-5 py-2 text-sm font-bold uppercase tracking-wide text-[#ef4444] hover:bg-[#ef4444]/30 disabled:opacity-50"
        >
          {killing ? t("bot.killing") : t("bot.killSwitch")}
        </button>
      </div>

      {killResult && <p className="text-xs text-amber-500">{killResult}</p>}

      {contact === "lost" && (
        <div className="rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-3 text-xs text-amber-200">
          <strong className="font-semibold">{t("bot.noContactTitle")}</strong>{" "}
          {t("bot.noContactBody")}
        </div>
      )}

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-zinc-400">
        {t("bot.safetyBanner")}
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
            {t("bot.activity")}
          </h2>
          <BotActivityFeed activity={activity} />
        </div>
      </div>
    </div>
  );
}
