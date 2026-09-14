import { describe, it, expect } from "vitest";
import { isUsageLimit, cooldownFrom, DEFAULT_COOLDOWN_MS } from "@/lib/research/usage-limit";

/** The exact message that burned three jobs in fifteen seconds. */
const REAL = new Error(
  "Claude Code returned an error result: You've hit your session limit · resets 6pm (America/New_York)",
);

describe("isUsageLimit", () => {
  it("recognises the message the runner actually hit", () => {
    expect(isUsageLimit(REAL)).toBe(true);
  });

  it("recognises the other ways a vendor says come back later", () => {
    for (const message of [
      "You've hit your usage limit",
      "429 Too Many Requests",
      "rate_limit_error",
      "Rate limit exceeded",
      "monthly quota exhausted",
      "Server overloaded, try again later",
    ]) {
      expect(isUsageLimit(new Error(message)), message).toBe(true);
    }
  });

  it("does NOT swallow a real failure as a rate limit", () => {
    // A job wrongly treated as rate-limited goes back in the queue and is
    // retried forever, so the error path must stay reachable.
    for (const message of [
      "Symbol NOTREAL not found",
      "Unexpected token < in JSON at position 0",
      "no handler for job type \"relations\" in this build",
      "ECONNREFUSED 127.0.0.1:11434",
      "TypeError: cannot read properties of undefined",
    ]) {
      expect(isUsageLimit(new Error(message)), message).toBe(false);
    }
  });

  it("copes with whatever shape the error arrives in", () => {
    expect(isUsageLimit("session limit reached")).toBe(true);
    expect(isUsageLimit({ error: "usage limit" })).toBe(true);
    expect(isUsageLimit(null)).toBe(false);
    expect(isUsageLimit(undefined)).toBe(false);
  });
});

describe("cooldownFrom", () => {
  /** 2pm New York, expressed as the UTC instant. */
  const twoPmNY = new Date("2026-09-14T18:00:00Z");

  it("waits until the stated reset hour, in the stated timezone", () => {
    const ms = cooldownFrom(REAL, twoPmNY);
    // 2pm → 6pm is four hours, plus the one-minute margin.
    expect(ms).toBe((4 * 60 + 1) * 60_000);
  });

  it("reads the timezone from the message rather than assuming this machine's", () => {
    // Same instant, but the process clock is irrelevant: only the named
    // zone decides how far away 6pm is.
    const fromUtcNoon = cooldownFrom(REAL, new Date("2026-09-14T18:00:00Z"));
    expect(fromUtcNoon).toBe((4 * 60 + 1) * 60_000);
  });

  it("rolls to tomorrow when the reset hour already passed today", () => {
    // 8pm NY, reset stated as 6pm: that is 22 hours away, not negative two.
    const eightPmNY = new Date("2026-09-15T00:00:00Z");
    // Capped — see the cap test below for why a far reset is not slept off
    // in one go.
    expect(cooldownFrom(REAL, eightPmNY)).toBe(6 * 60 * 60_000);
  });

  it("handles minutes and the am/pm edges", () => {
    const midnightNY = new Date("2026-09-14T04:00:00Z"); // 00:00 NY
    expect(cooldownFrom(new Error("resets 12:30am (America/New_York)"), midnightNY)).toBe(31 * 60_000);
    // Noon from midnight is twelve hours, so the cap applies.
    expect(cooldownFrom(new Error("resets 12pm (America/New_York)"), midnightNY)).toBe(6 * 60 * 60_000);
    // 1am reads as one hour away, not thirteen.
    expect(cooldownFrom(new Error("resets 1am (America/New_York)"), midnightNY)).toBe(61 * 60_000);
  });

  it("caps a distant reset at six hours rather than sleeping through it", () => {
    // The wait is derived from a vendor-written string. If the parse is ever
    // wrong, a capped mistake costs one wasted attempt every six hours; an
    // uncapped one takes AI research offline for a day with no way back.
    const justAfterMidnightNY = new Date("2026-09-14T04:01:00Z");
    const ms = cooldownFrom(new Error("resets 23:59 (America/New_York)"), justAfterMidnightNY);
    expect(ms).toBe(6 * 60 * 60_000);
  });

  it("falls back to a flat wait when there is no reset time to read", () => {
    expect(cooldownFrom(new Error("rate limit exceeded"))).toBe(DEFAULT_COOLDOWN_MS);
    expect(cooldownFrom(new Error("resets soon"))).toBe(DEFAULT_COOLDOWN_MS);
    expect(cooldownFrom(new Error("resets 99pm"))).toBe(DEFAULT_COOLDOWN_MS);
  });

  it("falls back when the named timezone is not one this runtime knows", () => {
    expect(cooldownFrom(new Error("resets 6pm (Mars/Olympus_Mons)"))).toBe(DEFAULT_COOLDOWN_MS);
  });

  it("never sleeps longer than six hours, whatever the message says", () => {
    const ms = cooldownFrom(new Error("resets 23:59 (America/New_York)"), new Date("2026-09-14T04:01:00Z"));
    expect(ms).toBeLessThanOrEqual(6 * 60 * 60_000);
  });

  it("always waits at least a minute past the boundary", () => {
    // Waking exactly at the reset second would just earn the same refusal.
    const oneMinuteBefore = new Date("2026-09-14T21:59:00Z"); // 17:59 NY
    expect(cooldownFrom(REAL, oneMinuteBefore)).toBeGreaterThan(60_000);
  });
});
