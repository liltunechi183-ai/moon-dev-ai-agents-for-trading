/**
 * Zero-config terminal notifications for the bot: a visible banner (color +
 * bell) printed in the worker's console output whenever the bot buys,
 * sells, or halts. No external service, no credentials — just impossible
 * to miss if you're watching the terminal where `npm run worker` runs.
 *
 * formatNotification() is pure and tested; notify() is the thin side-effect
 * (console + bell character) that the bot engine calls.
 */

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
 * real trade. */
export function notify(event: NotifyEvent): void {
  console.log(formatNotificationBanner(event));
  process.stdout.write(BELL);
}
