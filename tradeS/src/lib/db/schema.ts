// Writer-ownership contract (do not violate — this is what makes two-process
// SQLite safe here without a lock manager):
//
// The WORKER is the only writer of: latest_prices, bars_cache, quant_signals,
// predictions, prediction_outcomes, backtests, account_snapshots,
// bot_activity, bot_trades (derived), lessons, strategy_versions
// (proposals/promotions), discoveries (rows + grading), and assistant-role
// chat_messages.
//
// NEXT.JS writes only user-initiated rows: holdings, watchlist, jobs,
// orders_log (on submit), bot_config, bot_rules, bot_rule_versions,
// rule_suggestions status transitions, discoveries status transitions
// (approve/dismiss), and user-role chat_messages.
//
// Phases so far: 1 (dashboard/live data), 2 (predictions & accuracy),
// 3 (paper trading), 4 (bot). Later phases append more tables here.

import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";
import type { IndicatorSnapshot } from "@/lib/quant/types";
import type { Pattern } from "@/lib/quant/patterns";

export const holdings = sqliteTable("holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  shares: real("shares").notNull(),
  costBasis: real("cost_basis").notNull(),
  acquiredAt: integer("acquired_at"),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const watchlist = sqliteTable("watchlist", {
  symbol: text("symbol").primaryKey(),
  addedAt: integer("added_at").notNull(),
});

export const latestPrices = sqliteTable("latest_prices", {
  symbol: text("symbol").primaryKey(),
  price: real("price").notNull(),
  prevClose: real("prev_close"),
  dayOpen: real("day_open"),
  ts: integer("ts").notNull(),
  marketOpen: integer("market_open", { mode: "boolean" }).notNull(),
  source: text("source", { enum: ["alpaca", "yahoo"] }).notNull(),
  delayed: integer("delayed", { mode: "boolean" }).notNull(),
  currency: text("currency").notNull(),
});

export const barsCache = sqliteTable(
  "bars_cache",
  {
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").notNull(),
    ts: integer("ts").notNull(),
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    volume: real("volume").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.symbol, t.timeframe, t.ts] }),
    index("bars_cache_symbol_tf_idx").on(t.symbol, t.timeframe),
  ],
);

export const quantSignals = sqliteTable("quant_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  computedAt: integer("computed_at").notNull(),
  payload: text("payload", { mode: "json" }).notNull().$type<{
    indicators: IndicatorSnapshot;
    patterns: Pattern[];
  }>(),
});

// ---------------------------------------------------------------------------
// Predictions & grading (Phase 2). The accuracy dataset — predictions is
// APPEND-ONLY; never UPDATE a prediction row, history IS the dataset.
// ---------------------------------------------------------------------------

export const predictions = sqliteTable(
  "predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    createdAt: integer("created_at").notNull(),
    outlook: text("outlook", { enum: ["bullish", "neutral", "bearish"] }).notNull(),
    confidence: integer("confidence").notNull(),
    horizonDays: integer("horizon_days").notNull(),
    thesis: text("thesis").notNull(), // English base language; other languages via translations cache
    risks: text("risks", { mode: "json" }).notNull().$type<string[]>(),
    catalysts: text("catalysts", { mode: "json" }).notNull().$type<string[]>(),
    sources: text("sources", { mode: "json" })
      .notNull()
      .$type<Array<{ title: string; url: string }>>(),
    quantSnapshot: text("quant_snapshot", { mode: "json" }).$type<{
      indicators: IndicatorSnapshot;
      patterns: Pattern[];
    }>(),
    model: text("model"),
    durationMs: integer("duration_ms"),
    status: text("status", { enum: ["ok", "error"] }).notNull(),
    raw: text("raw"), // kept only when parsing failed
    revisedFromId: integer("revised_from_id"), // set when issued as a challenge-chat concession
    algoVersion: integer("algo_version"), // strategy version; null = v1 era
    regime: text("regime"),
  },
  (t) => [index("predictions_symbol_created_idx").on(t.symbol, t.createdAt)],
);

export const predictionOutcomes = sqliteTable("prediction_outcomes", {
  predictionId: integer("prediction_id").primaryKey(),
  evaluatedAt: integer("evaluated_at").notNull(),
  priceAtPrediction: real("price_at_prediction").notNull(),
  priceAtHorizon: real("price_at_horizon").notNull(),
  returnPct: real("return_pct").notNull(),
  directionCorrect: integer("direction_correct", { mode: "boolean" }).notNull(),
  maxDrawdownPct: real("max_drawdown_pct"), // worst close vs entry, <= 0
  maxGainPct: real("max_gain_pct"), // best close vs entry, >= 0
  neutralBandPct: real("neutral_band_pct"), // ATR-scaled band used to grade; null = flat ±3% era
  benchmarkReturnPct: real("benchmark_return_pct"), // SPY over the same window
});

// ---------------------------------------------------------------------------
// Strategy versions (Phase 2+). The analyst's playbook lives here, not in
// code, so the self-improvement engine can propose/test/promote/rollback
// without a deploy. Exactly one row is `active`. Bodies are stored WITHOUT
// the "## Investment strategy (vN)" header (render fns add it).
// ---------------------------------------------------------------------------

export const strategyVersions = sqliteTable("strategy_versions", {
  version: integer("version").primaryKey(),
  parentVersion: integer("parent_version"),
  fullText: text("full_text").notNull(), // live analyst body
  quantText: text("quant_text").notNull(), // technicals-only body for point-in-time sims
  changeSummary: text("change_summary").notNull(), // English base
  rationale: text("rationale").notNull(),
  tier: text("tier", { enum: ["quant", "full", "both"] }).notNull(),
  status: text("status", {
    enum: ["proposed", "testing", "active", "retired", "rejected"],
  }).notNull(),
  scorecard: text("scorecard", { mode: "json" }),
  createdBy: text("created_by", { enum: ["strategist", "human"] }).notNull(),
  createdAt: integer("created_at").notNull(),
  activatedAt: integer("activated_at"),
  retiredAt: integer("retired_at"),
});

// ---------------------------------------------------------------------------
// Trading (Phase 3). orders_log records every order this app submitted or
// saw on the trade stream — bracket legs are SEPARATE Alpaca orders, so the
// stream handler must UPSERT (an unknown order id is a leg fill, not noise).
// ---------------------------------------------------------------------------

export const ordersLog = sqliteTable("orders_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  alpacaOrderId: text("alpaca_order_id").notNull().unique(),
  parentOrderId: text("parent_order_id"), // bracket parent's alpaca order id
  symbol: text("symbol").notNull(),
  side: text("side", { enum: ["buy", "sell"] }).notNull(),
  type: text("type").notNull(),
  qty: real("qty"),
  notional: real("notional"),
  limitPrice: real("limit_price"),
  status: text("status").notNull(),
  source: text("source", { enum: ["manual", "bot"] }).notNull(),
  submittedAt: integer("submitted_at").notNull(),
  filledAt: integer("filled_at"),
  filledAvgPrice: real("filled_avg_price"),
  raw: text("raw", { mode: "json" }),
});

/** The equity curve. One row per snapshot; ts is the primary key. */
export const accountSnapshots = sqliteTable("account_snapshots", {
  ts: integer("ts").primaryKey(),
  equity: real("equity").notNull(),
  cash: real("cash").notNull(),
  buyingPower: real("buying_power").notNull(),
});

// ---------------------------------------------------------------------------
// Bot (Phase 4).
// ---------------------------------------------------------------------------

export const botConfig = sqliteTable("bot_config", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const botRules = sqliteTable("bot_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  condition: text("condition", { mode: "json" }).notNull(),
  action: text("action", { mode: "json" }).notNull(),
  version: integer("version").notNull().default(1), // bumped on every edit
  createdAt: integer("created_at").notNull(),
});

/** Append-only history so a trade is judged against the rule AT FIRE TIME. */
export const botRuleVersions = sqliteTable("bot_rule_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id").notNull(),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  condition: text("condition", { mode: "json" }).notNull(),
  action: text("action", { mode: "json" }).notNull(),
  createdAt: integer("created_at").notNull(),
});

/** DERIVED realized round trips — rebuilt from orders_log + bot_activity. */
export const botTrades = sqliteTable("bot_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  ruleId: integer("rule_id"),
  ruleVersion: integer("rule_version"),
  exitRuleId: integer("exit_rule_id"),
  qty: real("qty").notNull(),
  entryOrderId: text("entry_order_id").notNull(),
  exitOrderId: text("exit_order_id").notNull(),
  entryAt: integer("entry_at").notNull(),
  exitAt: integer("exit_at").notNull(),
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price").notNull(),
  pnlUsd: real("pnl_usd").notNull(),
  pnlPct: real("pnl_pct").notNull(),
  exitKind: text("exit_kind", {
    enum: ["stop-loss", "take-profit", "sell-rule", "other"],
  }).notNull(),
});

/** Full audit trail including blocked decisions and halts. */
export const botActivity = sqliteTable("bot_activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: integer("ts").notNull(),
  ruleId: integer("rule_id"),
  ruleVersion: integer("rule_version"),
  symbol: text("symbol"),
  decision: text("decision", { enum: ["buy", "sell", "skip", "blocked", "halt"] }).notNull(),
  reason: text("reason").notNull(),
  orderId: text("order_id"),
  snapshot: text("snapshot", { mode: "json" }),
});

// ---------------------------------------------------------------------------
// Phase 5: point-in-time sims, challenge chat, translations.
// ---------------------------------------------------------------------------

/** Point-in-time sims graded immediately (quant-only, zero news — one
 * leaked future headline poisons the whole backtest). */
export const backtests = sqliteTable(
  "backtests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    asOf: integer("as_of").notNull(),
    outlook: text("outlook", { enum: ["bullish", "neutral", "bearish"] }).notNull(),
    confidence: integer("confidence").notNull(),
    horizonDays: integer("horizon_days").notNull(),
    thesis: text("thesis").notNull(),
    quantSnapshot: text("quant_snapshot", { mode: "json" }).$type<{
      indicators: IndicatorSnapshot;
      patterns: Pattern[];
    }>(),
    priceAtAsOf: real("price_at_as_of").notNull(),
    priceAtHorizon: real("price_at_horizon").notNull(),
    returnPct: real("return_pct").notNull(),
    directionCorrect: integer("direction_correct", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at").notNull(),
    algoVersion: integer("algo_version"),
    model: text("model"),
    regime: text("regime"),
    maxDrawdownPct: real("max_drawdown_pct"),
    maxGainPct: real("max_gain_pct"),
    neutralBandPct: real("neutral_band_pct"),
    benchmarkReturnPct: real("benchmark_return_pct"),
  },
  (t) => [index("backtests_symbol_asof_idx").on(t.symbol, t.asOf)],
);

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  predictionId: integer("prediction_id").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** On-demand display-only translation cache. One table serves EVERY
 * non-base language (lang is a free-form code) — this is why no other
 * table needs per-language columns. */
export const translations = sqliteTable("translations", {
  hash: text("hash").primaryKey(), // sha256(lang + "\n" + sourceText)
  lang: text("lang").notNull(),
  sourceText: text("source_text").notNull(),
  translatedText: text("translated_text").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// Phase 6: self-improvement.
// ---------------------------------------------------------------------------

export const lessons = sqliteTable(
  "lessons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    predictionId: integer("prediction_id"), // XOR backtestId
    backtestId: integer("backtest_id"),
    source: text("source", { enum: ["live", "sim"] }).notNull(),
    symbol: text("symbol").notNull(),
    regime: text("regime"),
    algoVersion: integer("algo_version"),
    outlook: text("outlook", { enum: ["bullish", "neutral", "bearish"] }).notNull(),
    confidence: integer("confidence").notNull(),
    returnPct: real("return_pct").notNull(),
    directionCorrect: integer("direction_correct", { mode: "boolean" }).notNull(),
    rootCause: text("root_cause", {
      enum: [
        "bad-signal",
        "missed-catalyst",
        "regime-blindness",
        "overconfidence",
        "underconfidence",
        "stale-data",
        "bad-horizon",
        "crowded-trade",
        "other",
      ],
    }).notNull(),
    evidence: text("evidence").notNull(), // 2-3 sentences citing numbers
    ruleOfThumb: text("rule_of_thumb").notNull(), // one actionable line, English
    model: text("model"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("lessons_cause_created_idx").on(t.rootCause, t.createdAt),
    index("lessons_prediction_idx").on(t.predictionId),
    index("lessons_backtest_idx").on(t.backtestId),
  ],
);

/** A SEPARATE table on purpose: the bot / track record / calibration / UI
 * all read `predictions` and must NEVER accidentally trade on an
 * unvalidated strategy. Graded in place. */
export const shadowPredictions = sqliteTable(
  "shadow_predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    createdAt: integer("created_at").notNull(),
    strategyVersion: integer("strategy_version").notNull(), // the testing version
    pairedPredictionId: integer("paired_prediction_id"), // champion from the same packet
    outlook: text("outlook", { enum: ["bullish", "neutral", "bearish"] }).notNull(),
    confidence: integer("confidence").notNull(),
    horizonDays: integer("horizon_days").notNull(),
    thesis: text("thesis").notNull(),
    model: text("model"),
    regime: text("regime"),
    evaluatedAt: integer("evaluated_at"),
    priceAtPrediction: real("price_at_prediction"),
    priceAtHorizon: real("price_at_horizon"),
    returnPct: real("return_pct"),
    directionCorrect: integer("direction_correct", { mode: "boolean" }),
    maxDrawdownPct: real("max_drawdown_pct"),
    maxGainPct: real("max_gain_pct"),
    neutralBandPct: real("neutral_band_pct"),
    benchmarkReturnPct: real("benchmark_return_pct"),
  },
  (t) => [
    index("shadow_symbol_created_idx").on(t.symbol, t.createdAt),
    index("shadow_version_idx").on(t.strategyVersion),
  ],
);

/** Rule-advisor parameter tweaks — NEVER auto-applied; a human clicks
 * Apply (through the normal versioned rule edit) or Dismiss. */
export const ruleSuggestions = sqliteTable("rule_suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id"),
  ruleVersion: integer("rule_version"),
  suggestedCondition: text("suggested_condition", { mode: "json" }),
  suggestedAction: text("suggested_action", { mode: "json" }),
  summary: text("summary").notNull(), // plain grade-6 English
  evidence: text("evidence", { mode: "json" }),
  status: text("status", { enum: ["pending", "applied", "dismissed"] })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at").notNull(),
  resolvedAt: integer("resolved_at"),
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    status: text("status", { enum: ["queued", "running", "done", "error"] })
      .notNull()
      .default("queued"),
    result: text("result", { mode: "json" }),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
  },
  (t) => [index("jobs_status_created_idx").on(t.status, t.createdAt)],
);
