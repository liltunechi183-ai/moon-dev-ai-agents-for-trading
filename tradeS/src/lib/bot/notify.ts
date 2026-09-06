/**
 * Notifications for the bot: a visible banner (color + bell) in the worker's
 * console whenever it buys, sells, or halts, and — when NTFY_TOPIC is set —
 * the same event pushed to a phone.
 *
 * The terminal half needs no configuration and never fails. The push half is
 * optional and fire-and-forget on purpose: this is called from inside the
 * entry loop, and a notification service having a bad afternoon must never
 * be able to interrupt trading. A failed push is reported to the console and
 * otherwise ignored.
 *
 * formatNotification() is pure and tested; notify() is the thin side-effect
 * that the bot engine calls.
 */
import { env } from "@/lib/env";
import { buildNtfyRequest } from "./ntfy";

export type NotifyKind = "buy" | "sell" | "halt";

export interface NotifyEvent {
  kind: NotifyKind;
  symbol?: string | null;
  reason: string;
  ts?: number;
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BELL = "\x07";

const STYLE: Record<NotifyKind, { color: string; label: string; emoji: string }> = {
  buy: { color: GREEN, label: "BOT BOUGHT", emoji: "🟢" },
  sell: { color: GREEN, label: "BOT SOLD", emoji: "🔵" },
  halt: { color: RED, label: "BOT HALTED", emoji: "🛑" },
};

/** Pure: builds the banner text (no ANSI, no bell) — easy to assert on. */
export function formatNotificationText(event: NotifyEvent): string {
  const style = STYLE[event.kind];
  const when = new Date(event.ts ?? Date.now()).toLocaleTimeString();
  const subject = event.symbol ? `${event.symbol} — ` : "";
  return `${style.emoji} ${style.label}: ${subject}${event.reason} (${when})`;
}

/** Pure: wraps the text in a bordered box with color codes, for the terminal. */
export function formatNotificationBanner(event: NotifyEvent): string {
  const style = STYLE[event.kind];
  const text = formatNotificationText(event);
  const border = "─".repeat(Math.max(text.length, 20));
  return [
    `${style.color}${BOLD}┌${border}┐${RESET}`,
    `${style.color}${BOLD}│ ${text}${RESET}`,
    `${style.color}${BOLD}└${border}┘${RESET}`,
  ].join("\n");
}

/** Print the banner to the console and ring the terminal bell — every buy,
 * sell, and halt gets one, so the console never silently scrolls past a
 * real trade. Also pushes to ntfy when a topic is configured. */
export function notify(event: NotifyEvent): void {
  console.log(formatNotificationBanner(event));
  process.stdout.write(BELL);
  void pushToNtfy(event);
}

async function pushToNtfy(event: NotifyEvent): Promise<void> {
  const request = buildNtfyRequest(
    event,
    env.ntfyTopic ? { server: env.ntfyServer, topic: env.ntfyTopic } : null,
  );
  if (!request) return;

  try {
    // A hung request must not keep a handle open for the rest of the day.
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`[notify] ntfy returned ${response.status} — the terminal banner still stands`);
    }
  } catch (err) {
    // Never rethrow: this runs inside the entry loop.
    console.error("[notify] ntfy push failed — the terminal banner still stands:", err);
  }
}
