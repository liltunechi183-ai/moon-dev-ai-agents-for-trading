/**
 * Reconnect policy for the Alpaca market-data websocket, as pure functions
 * so the behaviour is testable without a socket.
 *
 * The case that motivated this: Alpaca's free tier allows exactly ONE
 * market-data connection per account. If anything else holds it — an
 * orphaned copy of this worker, another app on the same keys — every
 * attempt returns 406 "connection limit exceeded". Retrying that on a
 * 1-second backoff is worse than useless: it cannot succeed until the other
 * connection goes away, it buries the log under thousands of identical
 * lines, and each attempt is itself a connection that can keep the limit
 * tripped. So 406 gets its own, much slower ladder and a one-time
 * explanation instead of a wall of raw error objects.
 */

/** Alpaca stream error codes we treat specially. */
export const ERR_CONNECTION_LIMIT = 406;
export const ERR_NOT_AUTHENTICATED = 401;
export const ERR_AUTH_TIMEOUT = 404;

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
/** 406 cannot clear by retrying, so start slow and go slower. */
const LIMIT_BASE_DELAY_MS = 60_000;
const LIMIT_MAX_DELAY_MS = 15 * 60_000;

export interface BackoffState {
  /** How many connection attempts have failed in a row. Reset on success. */
  consecutiveFailures: number;
  /** The last server error code seen, or null if the socket just dropped. */
  lastErrorCode: number | null;
}

export function initialBackoffState(): BackoffState {
  return { consecutiveFailures: 0, lastErrorCode: null };
}

/** How long to wait before the next connection attempt. */
export function nextDelayMs(state: BackoffState): number {
  const n = Math.max(state.consecutiveFailures, 1);
  if (state.lastErrorCode === ERR_CONNECTION_LIMIT) {
    return Math.min(LIMIT_BASE_DELAY_MS * 2 ** (n - 1), LIMIT_MAX_DELAY_MS);
  }
  return Math.min(BASE_DELAY_MS * 2 ** (n - 1), MAX_DELAY_MS);
}

/**
 * Whether to print this failure. The first three are always worth seeing;
 * after that every tenth is enough to show it's still trying without
 * drowning every other line in the worker's output.
 */
export function shouldLogFailure(consecutiveFailures: number): boolean {
  return consecutiveFailures <= 3 || consecutiveFailures % 10 === 0;
}

/**
 * A plain-language explanation for the error codes a human can actually act
 * on. Returns null for codes where the raw message is as good as anything.
 */
export function describeStreamError(code: number): string | null {
  switch (code) {
    case ERR_CONNECTION_LIMIT:
      return (
        "another connection is already using this Alpaca account's single " +
        "market-data slot (free tier allows one). Close any other copy of " +
        "the worker — quotes fall back to Yahoo meanwhile"
      );
    case ERR_NOT_AUTHENTICATED:
      return "the stream rejected the credentials — check ALPACA_KEY_ID / ALPACA_SECRET_KEY in .env.local";
    case ERR_AUTH_TIMEOUT:
      return "the stream timed out before authentication completed";
    default:
      return null;
  }
}
