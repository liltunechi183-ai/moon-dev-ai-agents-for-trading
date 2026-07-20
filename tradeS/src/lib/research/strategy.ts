import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";

export type StrategyVersion = typeof tables.strategyVersions.$inferSelect;

const V1_FULL = `Act as a careful equity research analyst. Weigh fundamentals for
direction and technicals for timing. Be honest about uncertainty. (v1 marker
strategy — superseded by v2, kept so old predictions can be attributed.)`;

const V1_QUANT = `Use only the technical indicators and patterns provided. Trend
following: prefer the direction of the 50- and 200-day averages. (v1 marker.)`;

const V2_FULL = `**Philosophy:** you are estimating probabilities, not telling stories. Think in
base rates and expected value. A thesis must name what would prove it wrong.
Process over outcome; capital preservation over excitement. When evidence
conflicts across timeframes, the higher timeframe wins.

1. **Regime first.** Establish market and stock regime before any setup: price vs
   200-day SMA, VIX regime, relative strength vs sector and S&P. Long setups need
   an uptrend or early-reversal evidence; do not call bullish below a falling
   200-day SMA, nor bearish on a strong uptrend without a concrete catalyst —
   trends persist more often than they reverse.
2. **Direction from fundamentals + flow of information,** in rough order: earnings
   surprise + raised guidance (post-earnings drift 30-60d); analyst estimate
   revisions (follow the revisions, not the target level); insider **cluster**
   buying (multiple insiders, real size); improving profitability/quality supports
   longs, deteriorating quality + rising leverage supports shorts.
3. **Timing from technicals:** uptrend pullback to 20/50-day SMA with RSI 35-50
   resuming up; breakout above resistance/52w high on volume >= 150% of the 20-day
   average; oversold quality (RSI < 30 above 200-day SMA) for a mean-reversion long;
   distribution/breakdown (falling OBV, volume breakdown below support) for bearish.
4. **Crowding check.** Extreme one-sided retail sentiment, parabolic extension, or
   "everyone agrees" narratives **lower** expected value — cut confidence.
5. **Confidence rubric** (start at 3, adjust, justify each point): +1 regime
   aligned; +1 confirmed fundamental catalyst; +1 clean technical setup with
   volume; +1 insider cluster or persistent revisions your way; -1 crowded/
   extended; -1 timeframes conflict; -1 measured track record shows this segment
   underperforming. Cap at 8 unless nearly everything aligns. Below 4 = "lean,
   don't bet."
6. **Horizon discipline.** Mean-reversion 10-30d, breakout/PEAD 30-60d, trend
   continuation 60-90d. Only call **neutral** when you truly expect a flat range;
   on a high-vol stock (ATR > 3%) prefer a low-confidence directional call.
7. **Falsification.** End every thesis with the invalidation level/event/data.`;

const V2_QUANT = `**Philosophy:** estimate probabilities from price action only — no news, no
fundamentals. Think in base rates. When timeframes conflict, the higher
timeframe wins.

1. **Regime first.** Price vs 200-day SMA sets the allowed directions: do not
   call bullish below a falling 200-day SMA, nor bearish on a strong uptrend.
   Trends persist more often than they reverse.
2. **Setups (timing):** uptrend pullback to 20/50-day SMA with RSI 35-50
   resuming up; breakout above resistance/52w high on volume >= 150% of the
   20-day average; oversold (RSI < 30) above a rising 200-day SMA for a
   mean-reversion long; falling OBV + breakdown below support on volume for
   bearish.
3. **Crowding proxy:** parabolic extension far above the 20-day SMA lowers
   expected value — cut confidence.
4. **Confidence rubric** (start at 3): +1 regime aligned; +1 clean setup with
   volume confirmation; -1 extended/parabolic; -1 timeframes conflict. Cap at
   8. Below 4 = "lean, don't bet."
5. **Horizon discipline.** Mean-reversion 10-30d, breakout 30-60d, trend
   continuation 60-90d. Only call neutral when you truly expect a flat range;
   on a high-vol stock (ATR > 3%) prefer a low-confidence directional call.
6. **Falsification.** End every thesis with the invalidation level.`;

/** Idempotently seed v1 (marker) and v2 (the real playbook, active). */
export function seedStrategies(): void {
  const now = Date.now();
  db.insert(tables.strategyVersions)
    .values({
      version: 1,
      parentVersion: null,
      fullText: V1_FULL,
      quantText: V1_QUANT,
      changeSummary: "Initial marker strategy.",
      rationale: "Placeholder attributed to the earliest predictions.",
      tier: "both",
      status: "retired",
      createdBy: "human",
      createdAt: now,
      retiredAt: now,
    })
    .onConflictDoNothing()
    .run();
  db.insert(tables.strategyVersions)
    .values({
      version: 2,
      parentVersion: 1,
      fullText: V2_FULL,
      quantText: V2_QUANT,
      changeSummary:
        "The real playbook: regime first, fundamentals for direction, technicals for timing, crowding check, explicit confidence rubric, horizon discipline, falsification.",
      rationale:
        "Drawn from well-replicated market research: trend persistence, post-earnings drift, estimate revisions, insider cluster buying, volume-confirmed breakouts, and mean reversion in oversold quality names.",
      tier: "both",
      status: "active",
      createdBy: "human",
      createdAt: now,
      activatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}

export function getActiveStrategy(): StrategyVersion {
  const [row] = db
    .select()
    .from(tables.strategyVersions)
    .where(eq(tables.strategyVersions.status, "active"))
    .orderBy(desc(tables.strategyVersions.version))
    .limit(1)
    .all();
  if (!row) {
    seedStrategies();
    return getActiveStrategy();
  }
  return row;
}

export function getTestingVersion(): StrategyVersion | undefined {
  const [row] = db
    .select()
    .from(tables.strategyVersions)
    .where(eq(tables.strategyVersions.status, "testing"))
    .orderBy(desc(tables.strategyVersions.version))
    .limit(1)
    .all();
  return row;
}

export function getStrategyVersion(version: number): StrategyVersion | undefined {
  const [row] = db
    .select()
    .from(tables.strategyVersions)
    .where(eq(tables.strategyVersions.version, version))
    .limit(1)
    .all();
  return row;
}

export function listStrategyVersions(): StrategyVersion[] {
  return db
    .select()
    .from(tables.strategyVersions)
    .orderBy(desc(tables.strategyVersions.version))
    .all();
}

/** Bodies are stored without the header; these add it. */
export function renderFullStrategy(s: StrategyVersion): string {
  return `## Investment strategy (v${s.version})\n\n${s.fullText}`;
}

export function renderQuantStrategy(s: StrategyVersion): string {
  return `## Investment strategy (v${s.version})\n\n${s.quantText}`;
}
