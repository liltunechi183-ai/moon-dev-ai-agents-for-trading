/**
 * Telling "the model refused this job" apart from "the account is out of
 * budget until 6pm".
 *
 * The distinction decides what happens to the work. A job that failed on
 * its own merits is finished — recording the error is the right outcome.
 * A job that never ran because the account was rate-limited is untouched
 * work, and marking it `error` throws it away for a reason that had nothing
 * to do with it.
 *
 * Without the distinction the queue is not merely noisy, it is destructive:
 * the poller wakes every five seconds, claims the next job, gets the same
 * refusal, and burns it. A limit that lasts an hour consumes several hundred
 * jobs, all of them permanently marked failed and none of them ever
 * attempted. That is how three consecutive job numbers appear in the log
 * seconds apart.
 *
 * Kept away from the SDK and the database so the parsing can be tested for
 * what it is — string handling on messages a vendor writes and will
 * eventually reword.
 */

/** How long to stand down when the message gives no reset time. */
export const DEFAULT_COOLDOWN_MS = 30 * 60_000;

/** Never sleep past this, however the message reads. */
const MAX_COOLDOWN_MS = 6 * 60 * 60_000;

/**
 * Phrases that mean "come back later", not "this request was wrong".
 *
 * Matched loosely and case-insensitively on purpose: the exact sentence is
 * the vendor's to change, and the cost of missing a new wording is the old
 * destructive behaviour, while the cost of a false positive is one delayed
 * research job on a system that runs research once a day.
 */
const LIMIT_PHRASES = [
  "session limit",
  "usage limit",
  "rate limit",
  "rate_limit",
  "too many requests",
  "quota",
  "resets ",
  "try again later",
  "overloaded",
];

export function isUsageLimit(error: unknown): boolean {
  const text = String(
    error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error ?? ""),
  ).toLowerCase();
  return LIMIT_PHRASES.some((phrase) => text.includes(phrase));
}

/**
 * When the message says "resets 6pm", work out how long that is from now.
 *
 * The hour is stated in the account's own timezone, which the message names
 * and this process may not share, so the parenthesised zone is honoured when
 * present. A reset hour that has already passed today means tomorrow.
 * Anything unparseable falls back to the flat cooldown — a wrong guess at a
 * clock time would be worse than simply waiting a while.
 */
export function cooldownFrom(error: unknown, now = new Date()): number {
  const text = String(error instanceof Error ? error.message : error ?? "");
  const match = /resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:\(([^)]+)\))?/i.exec(text);
  if (!match) return DEFAULT_COOLDOWN_MS;

  const [, rawHour, rawMinute, meridiem, zone] = match;
  let hour = Number(rawHour);
  const minute = rawMinute ? Number(rawMinute) : 0;
  if (hour > 23 || minute > 59) return DEFAULT_COOLDOWN_MS;

  const suffix = meridiem?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;

  const nowInZone = zone ? shiftToZone(now, zone) : now;
  if (!nowInZone) return DEFAULT_COOLDOWN_MS;

  let minutesUntil = hour * 60 + minute - (nowInZone.getHours() * 60 + nowInZone.getMinutes());
  if (minutesUntil <= 0) minutesUntil += 24 * 60; // already past today

  // One extra minute, so waking exactly on the boundary does not just earn
  // the same refusal again.
  const ms = (minutesUntil + 1) * 60_000;
  return Math.min(ms, MAX_COOLDOWN_MS);
}

/** `now` expressed as wall-clock time in the named zone, or null if the zone
 * is not one this runtime knows. */
function shiftToZone(now: Date, zone: string): Date | null {
  try {
    return new Date(now.toLocaleString("en-US", { timeZone: zone.trim() }));
  } catch {
    return null;
  }
}
