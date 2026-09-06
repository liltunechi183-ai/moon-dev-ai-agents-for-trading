import { z } from "zod";

// Empty strings count as unset, so a template like `ALPACA_KEY_ID=` behaves
// as "not set" rather than "set to empty string".
const emptyToUndef = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional(),
);

const rawSchema = z.object({
  ALPACA_KEY_ID: emptyToUndef,
  ALPACA_SECRET_KEY: emptyToUndef,
  ALPACA_PAPER: emptyToUndef,
  SEC_EDGAR_USER_AGENT: emptyToUndef,
  DATABASE_PATH: emptyToUndef,
  REDDIT_CLIENT_ID: emptyToUndef,
  REDDIT_CLIENT_SECRET: emptyToUndef,
  AUTH_ENABLED: emptyToUndef,
  AUTH_SECRET: emptyToUndef,
  QUIVER_API_KEY: emptyToUndef,
  ALPACA_ALLOW_LIVE: emptyToUndef,
  ALPACA_LIVE_KEY_ID: emptyToUndef,
  ALPACA_LIVE_SECRET_KEY: emptyToUndef,
  NTFY_TOPIC: emptyToUndef,
  NTFY_SERVER: emptyToUndef,
});

const raw = rawSchema.parse(process.env);

// ALPACA_PAPER defaults to true; only the literal string "false" turns it off.
const paper = raw.ALPACA_PAPER !== "false";

const activeKeyId = paper ? raw.ALPACA_KEY_ID : raw.ALPACA_LIVE_KEY_ID;
const activeSecretKey = paper ? raw.ALPACA_SECRET_KEY : raw.ALPACA_LIVE_SECRET_KEY;

export const env = {
  paper,
  alpacaKeyId: raw.ALPACA_KEY_ID,
  alpacaSecretKey: raw.ALPACA_SECRET_KEY,
  alpacaLiveKeyId: raw.ALPACA_LIVE_KEY_ID,
  alpacaLiveSecretKey: raw.ALPACA_LIVE_SECRET_KEY,
  activeKeyId,
  activeSecretKey,
  hasAlpacaKeys: Boolean(activeKeyId && activeSecretKey),
  secEdgarUserAgent: raw.SEC_EDGAR_USER_AGENT || "TradeS personal project unset@example.com",
  databasePath: raw.DATABASE_PATH || "./data/trades.db",
  hasRedditKeys: Boolean(raw.REDDIT_CLIENT_ID && raw.REDDIT_CLIENT_SECRET),
  redditClientId: raw.REDDIT_CLIENT_ID,
  redditClientSecret: raw.REDDIT_CLIENT_SECRET,
  authEnabled: raw.AUTH_ENABLED === "true",
  authSecret: raw.AUTH_SECRET,
  quiverApiKey: raw.QUIVER_API_KEY,
  allowLive: raw.ALPACA_ALLOW_LIVE === "true",

  // Push notifications. The topic is the whole secret on ntfy — anyone who
  // knows the name can read the messages and publish to it — so it lives in
  // .env.local with the keys and is never logged.
  ntfyTopic: raw.NTFY_TOPIC,
  ntfyServer: (raw.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, ""),

  tradingBaseUrl: paper
    ? "https://paper-api.alpaca.markets"
    : "https://api.alpaca.markets",
  dataBaseUrl: "https://data.alpaca.markets",
  dataStreamUrl: "wss://stream.data.alpaca.markets/v2/iex",
  get tradeStreamUrl() {
    const base = paper
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets";
    return base.replace("https", "wss") + "/stream";
  },
};

/**
 * This project runs the Claude Agent SDK on the machine's existing Claude
 * Code subscription login. If ANTHROPIC_API_KEY is present, the SDK silently
 * switches to per-token API billing instead. Deleting it here is deliberate.
 * Call this at worker boot, before importing anything AI-related.
 */
export function guardAnthropicKey(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "[env] ANTHROPIC_API_KEY detected — removing it so the Agent SDK uses " +
        "the Claude Code login instead of billing the API.",
    );
    delete process.env.ANTHROPIC_API_KEY;
  }
}
