import { describe, it, expect } from "vitest";
import {
  initialBackoffState,
  nextDelayMs,
  shouldLogFailure,
  describeStreamError,
  ERR_CONNECTION_LIMIT,
  ERR_NOT_AUTHENTICATED,
  ERR_AUTH_TIMEOUT,
} from "@/lib/stream-backoff";

describe("nextDelayMs — ordinary drops", () => {
  it("starts at one second and doubles", () => {
    expect(nextDelayMs({ consecutiveFailures: 1, lastErrorCode: null })).toBe(1_000);
    expect(nextDelayMs({ consecutiveFailures: 2, lastErrorCode: null })).toBe(2_000);
    expect(nextDelayMs({ consecutiveFailures: 3, lastErrorCode: null })).toBe(4_000);
  });

  it("caps at 30s no matter how long it has been failing", () => {
    expect(nextDelayMs({ consecutiveFailures: 50, lastErrorCode: null })).toBe(30_000);
  });

  it("treats a fresh state (0 failures) as the first attempt, never 0ms", () => {
    expect(nextDelayMs(initialBackoffState())).toBe(1_000);
  });
});

describe("nextDelayMs — connection limit (406)", () => {
  it("waits far longer than an ordinary drop: retrying cannot clear it", () => {
    const limit = nextDelayMs({ consecutiveFailures: 1, lastErrorCode: ERR_CONNECTION_LIMIT });
    const ordinary = nextDelayMs({ consecutiveFailures: 1, lastErrorCode: null });
    expect(limit).toBe(60_000);
    expect(limit).toBeGreaterThan(ordinary);
  });

  it("backs off to a 15-minute ceiling", () => {
    expect(nextDelayMs({ consecutiveFailures: 4, lastErrorCode: ERR_CONNECTION_LIMIT })).toBe(
      8 * 60_000,
    );
    expect(nextDelayMs({ consecutiveFailures: 99, lastErrorCode: ERR_CONNECTION_LIMIT })).toBe(
      15 * 60_000,
    );
  });

  it("regression: a storm of 406s never produces a sub-second retry", () => {
    for (let n = 1; n <= 200; n++) {
      expect(
        nextDelayMs({ consecutiveFailures: n, lastErrorCode: ERR_CONNECTION_LIMIT }),
      ).toBeGreaterThanOrEqual(60_000);
    }
  });
});

describe("shouldLogFailure", () => {
  it("shows the first three failures", () => {
    expect(shouldLogFailure(1)).toBe(true);
    expect(shouldLogFailure(2)).toBe(true);
    expect(shouldLogFailure(3)).toBe(true);
  });

  it("goes quiet in between, then reports every tenth", () => {
    expect(shouldLogFailure(4)).toBe(false);
    expect(shouldLogFailure(9)).toBe(false);
    expect(shouldLogFailure(10)).toBe(true);
    expect(shouldLogFailure(20)).toBe(true);
    expect(shouldLogFailure(21)).toBe(false);
  });
});

describe("describeStreamError", () => {
  it("explains the connection limit in terms a human can act on", () => {
    const msg = describeStreamError(ERR_CONNECTION_LIMIT);
    expect(msg).toContain("one");
    expect(msg).toContain("worker");
  });

  it("points bad credentials at the file that holds them", () => {
    expect(describeStreamError(ERR_NOT_AUTHENTICATED)).toContain(".env.local");
  });

  it("covers the auth timeout", () => {
    expect(describeStreamError(ERR_AUTH_TIMEOUT)).toContain("authentication");
  });

  it("returns null for codes it has nothing useful to add about", () => {
    expect(describeStreamError(500)).toBeNull();
  });
});
