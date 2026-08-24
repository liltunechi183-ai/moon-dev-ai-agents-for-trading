import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";

export interface BotConfigValues {
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
  /** Primer Salto runs beside the AI rule engine, with its own on/off switch
   * so one can be tested without the other. Both obey the same safeguards. */
  primerSaltoEnabled: boolean;
  primerSaltoNotionalUsd: number;
}

export const DEFAULT_BOT_CONFIG: BotConfigValues = {
  enabled: false,
  maxPositionUsd: 1000,
  maxTotalExposureUsd: 5000,
  maxDailyLossUsd: 250,
  maxOrdersPerDay: 10,
  cooldownMinutes: 120,
  minConfidence: 7,
  liveAck: "",
  budgetUsd: 5000,
  cashReservePct: 0.1,
  maxSlicePct: 0.2,
  primerSaltoEnabled: false,
  primerSaltoNotionalUsd: 400,
};

/** The exact sentence a human must type before live trading can unlock. */
export const LIVE_ACK_SENTENCE =
  "I understand this bot will trade real money and I accept full responsibility for all losses.";

export function getBotConfig(): BotConfigValues {
  const rows = db.select().from(tables.botConfig).all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_BOT_CONFIG, ...stored } as BotConfigValues;
}

export function setBotConfig(patch: Partial<BotConfigValues>): void {
  for (const [key, value] of Object.entries(patch)) {
    db.insert(tables.botConfig)
      .values({ key, value })
      .onConflictDoUpdate({ target: tables.botConfig.key, set: { value } })
      .run();
  }
}

export function isLiveAckValid(config: BotConfigValues): boolean {
  return config.liveAck.trim() === LIVE_ACK_SENTENCE;
}

export function disableBot(reason: string): void {
  setBotConfig({ enabled: false });
  db.insert(tables.botActivity)
    .values({ ts: Date.now(), decision: "halt", reason, snapshot: null })
    .run();
}

export { eq };
