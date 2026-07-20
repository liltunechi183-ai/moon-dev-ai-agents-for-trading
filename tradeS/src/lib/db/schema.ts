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
// Phases so far: 1 (dashboard/live data), 2 (predictions & accuracy).
// Later phases append more tables here.

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
