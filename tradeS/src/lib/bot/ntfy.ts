/**
 * Push delivery for bot notifications, via ntfy.
 *
 * The terminal banner in `notify.ts` only reaches somebody sitting in front
 * of the terminal. A strategy that acts once a day at 15:50 and then averages
 * two entries a month is precisely the case where nobody is watching — so
 * the one moment worth seeing is the one most likely to scroll past unseen.
 *
 * Only real events go out: a buy, a sell, a halt. The daily "scanned 69
 * symbols, bought nothing" heartbeat stays in the database, because a push
 * that arrives every day saying nothing happened is a push that gets muted,
 * and a muted channel loses the halt too.
 *
 * The request is built as data here, separately from sending it, because the
 * failure this must not have is a malformed header taking down the worker
 * inside a trading loop — and header rules are exactly the sort of thing
 * worth pinning down in a test rather than discovering in production.
 */
import type { NotifyEvent, NotifyKind } from "./notify";

export interface NtfyConfig {
  server: string;
  topic: string;
}

export interface NtfyRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** ntfy's rendering hints, per kind. Priority 5 is its "urgent" level. */
const DELIVERY: Record<NotifyKind, { tags: string; priority: string; verb: string }> = {
  buy: { tags: "green_circle,chart_with_upwards_trend", priority: "4", verb: "BOUGHT" },
  sell: { tags: "blue_circle,heavy_dollar_sign", priority: "4", verb: "SOLD" },
  halt: { tags: "rotating_light,octagonal_sign", priority: "5", verb: "HALTED" },
};

/**
 * ntfy carries the title in an HTTP header, and headers are byte strings.
 * A reason built by this codebase routinely contains an em dash, and a
 * symbol could carry anything; a non-ASCII byte in a header value makes
 * `fetch` throw, which inside the entry loop would abort the scan for every
 * symbol after it. The body has no such limit and stays untouched, so
 * nothing is actually lost — the accents live one line down.
 */
export function toHeaderSafe(value: string, maxLength = 200): string {
  const ascii = value
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // Anything still outside printable ASCII becomes a space rather than
    // vanishing, so words do not silently run together.
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ascii.length > maxLength ? `${ascii.slice(0, maxLength - 1).trimEnd()}…`.slice(0, maxLength) : ascii;
}

/** The POST that publishes one event, or null when no topic is configured. */
export function buildNtfyRequest(event: NotifyEvent, config: NtfyConfig | null): NtfyRequest | null {
  if (!config || !config.topic) return null;

  const delivery = DELIVERY[event.kind];
  const symbol = event.symbol ? ` ${event.symbol}` : "";
  const title = toHeaderSafe(`TradeS ${delivery.verb}${symbol}`, 120);

  return {
    url: `${config.server.replace(/\/+$/, "")}/${config.topic}`,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      Title: title,
      Priority: delivery.priority,
      Tags: delivery.tags,
    },
    // The body is UTF-8 and keeps the text exactly as written.
    body: event.reason,
  };
}
