export interface SafeguardInput {
  /** The exact trading base URL an order would go to. Checked FIRST. */
  tradingBaseUrl: string;
  /** Live triple lock (all three or the order is refused on a live host). */
  allowLiveEnv: boolean; // ALPACA_ALLOW_LIVE=true
  liveKeysInUse: boolean; // separate live keys actually selected
  liveAckOk: boolean; // typed acknowledgment stored in bot_config

  marketOpen: boolean;
  /** Age of the prediction driving this order. */
  predictionAgeMs: number;

  /** Daily-loss circuit breaker. */
  dayStartEquity: number | null;
  currentEquity: number;
  maxDailyLossUsd: number;

  /** Caps. */
  orderNotionalUsd: number;
  symbolExposureUsd: number;
  totalExposureUsd: number;
  maxPositionUsd: number;
  maxTotalExposureUsd: number;

  ordersToday: number;
  maxOrdersPerDay: number;

  /** Cooldown. */
  lastOrderForSymbolAt: number | null;
  cooldownMinutes: number;
  now: number;
}

export type SafeguardResult =
  | { ok: true }
  | { ok: false; reason: string; halt?: boolean };

const PREDICTION_MAX_AGE_MS = 24 * 60 * 60_000;
const PAPER_HOST = "paper-api.alpaca.markets";

/**
 * PURE safety gate, run before every bot order. The paper-host assertion is
 * deliberately FIRST and independent of env logic — even if env.ts were
 * misconfigured, a live host is refused unless all three live unlocks hold.
 * A `halt: true` result means the caller must disable the bot.
 */
export function checkSafeguards(input: SafeguardInput): SafeguardResult {
  // 1. Deepest guard: never talk to a non-paper host without the triple lock.
  if (!input.tradingBaseUrl.includes(PAPER_HOST)) {
    const unlocked = input.allowLiveEnv && input.liveKeysInUse && input.liveAckOk;
    if (!unlocked) {
      return {
        ok: false,
        reason:
          "REFUSED: order would go to a LIVE trading host without all three live unlocks (env flag + live keys + typed acknowledgment)",
      };
    }
  }

  // 2. Market must be open.
  if (!input.marketOpen) return { ok: false, reason: "market is closed" };

  // 3. Prediction freshness.
  if (input.predictionAgeMs > PREDICTION_MAX_AGE_MS) {
    return { ok: false, reason: "prediction is older than 24h" };
  }

  // 4. Daily-loss circuit breaker — trips the halt.
  if (input.dayStartEquity !== null) {
    const dayLoss = input.dayStartEquity - input.currentEquity;
    if (dayLoss >= input.maxDailyLossUsd) {
      return {
        ok: false,
        halt: true,
        reason: `daily loss $${dayLoss.toFixed(2)} reached the $${input.maxDailyLossUsd} circuit breaker`,
      };
    }
  }

  // 5. Per-symbol cap.
  if (input.symbolExposureUsd + input.orderNotionalUsd > input.maxPositionUsd) {
    return {
      ok: false,
      reason: `order would push this symbol's exposure past the $${input.maxPositionUsd} per-stock cap`,
    };
  }

  // 6. Total exposure cap.
  if (input.totalExposureUsd + input.orderNotionalUsd > input.maxTotalExposureUsd) {
    return {
      ok: false,
      reason: `order would push total exposure past the $${input.maxTotalExposureUsd} cap`,
    };
  }

  // 7. Orders-per-day cap.
  if (input.ordersToday >= input.maxOrdersPerDay) {
    return { ok: false, reason: `already placed ${input.ordersToday} orders today (max ${input.maxOrdersPerDay})` };
  }

  // 8. Per-symbol cooldown.
  if (input.lastOrderForSymbolAt !== null) {
    const sinceMs = input.now - input.lastOrderForSymbolAt;
    if (sinceMs < input.cooldownMinutes * 60_000) {
      return {
        ok: false,
        reason: `cooldown: last order for this symbol was ${Math.round(sinceMs / 60_000)}m ago (need ${input.cooldownMinutes}m)`,
      };
    }
  }

  return { ok: true };
}
