import WebSocket from "ws";
import { env } from "@/lib/env";
import { getTrackedSymbols } from "@/lib/tracked";
import { writeLatestPrice } from "@/lib/prices";
import { toAlpacaSymbol, toAppSymbol, isUsTicker } from "@/lib/alpaca/symbols";
import { alpaca } from "@/lib/alpaca/client";
import {
  initialBackoffState,
  nextDelayMs,
  shouldLogFailure,
  describeStreamError,
} from "@/lib/stream-backoff";

const RESUBSCRIBE_INTERVAL_MS = 30_000;
const HEAL_INTERVAL_MS = 5 * 60_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;
const WRITE_THROTTLE_MS = 500;

/**
 * Owns the SINGLE Alpaca IEX market-data websocket. The free tier allows
 * exactly one per account — nothing else in this app may open one.
 */
export function startPriceStream(): void {
  if (!env.hasAlpacaKeys) {
    console.log("[price-stream] no Alpaca keys — skipping (yahoo-poller covers US quotes)");
    return;
  }

  let ws: WebSocket | null = null;
  let backoff = initialBackoffState();
  let reconnectPending = false;
  let authenticated = false;
  let lastHeartbeat = Date.now();
  let currentSubscribed = new Set<string>();
  const lastWriteAt = new Map<string, number>();

  function usSymbols(): string[] {
    return getTrackedSymbols().filter(isUsTicker);
  }

  function connect() {
    authenticated = false;
    lastHeartbeat = Date.now();
    const socket = new WebSocket(env.dataStreamUrl);
    ws = socket;

    socket.on("open", () => {
      socket.send(
        JSON.stringify({ action: "auth", key: env.activeKeyId, secret: env.activeSecretKey }),
      );
    });

    socket.on("message", (raw) => {
      lastHeartbeat = Date.now();
      let messages: unknown;
      try {
        messages = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const arr = Array.isArray(messages) ? messages : [messages];
      for (const msg of arr) handleMessage(msg);
    });

    socket.on("close", () => scheduleReconnect(socket));

    socket.on("error", (err) => {
      // Surfaced through the close handler's throttled reporting; logging
      // here too would double every line during an outage.
      if (backoff.consecutiveFailures === 0) console.error("[price-stream] error:", err);
    });
  }

  function handleMessage(msg: unknown) {
    if (typeof msg !== "object" || msg === null || !("T" in msg)) return;
    const m = msg as Record<string, unknown>;

    if (m.T === "success" && m.msg === "authenticated") {
      authenticated = true;
      if (backoff.consecutiveFailures > 0) console.log("[price-stream] reconnected");
      backoff = initialBackoffState();
      currentSubscribed = new Set();
      resubscribe();
      return;
    }
    if (m.T === "error") {
      // Remember the code so scheduleReconnect can pick the right ladder —
      // 406 in particular must not be retried on the fast one.
      backoff.lastErrorCode = typeof m.code === "number" ? m.code : null;
      return;
    }
    if (m.T === "t") {
      // trade message: { T: "t", S: symbol, p: price, t: timestamp }
      const alpacaSymbol = m.S as string;
      const price = m.p as number;
      if (typeof alpacaSymbol !== "string" || typeof price !== "number") return;
      const appSymbol = toAppSymbol(alpacaSymbol);

      const now = Date.now();
      const last = lastWriteAt.get(appSymbol) ?? 0;
      if (now - last < WRITE_THROTTLE_MS) return;
      lastWriteAt.set(appSymbol, now);

      writeLatestPrice({
        symbol: appSymbol,
        price,
        marketOpen: true,
        source: "alpaca",
        delayed: false,
        currency: "USD",
      });
    }
  }

  function resubscribe() {
    // `authenticated` matters as much as OPEN here: the periodic resubscribe
    // timer would otherwise fire on a socket that is connected but has not
    // finished authenticating, and Alpaca answers a premature subscribe with
    // 401 "not authenticated" — which reads as bad credentials when the keys
    // are in fact fine. It also logged "subscribed to N symbols" for a
    // subscription the server had rejected.
    if (!authenticated || !ws || ws.readyState !== WebSocket.OPEN) return;
    const wanted = new Set(usSymbols());
    if (setsEqual(wanted, currentSubscribed)) return;

    const toUnsubscribe = [...currentSubscribed].filter((s) => !wanted.has(s));
    const toSubscribe = [...wanted].filter((s) => !currentSubscribed.has(s));

    if (toUnsubscribe.length) {
      ws.send(JSON.stringify({ action: "unsubscribe", trades: toUnsubscribe.map(toAlpacaSymbol) }));
    }
    if (toSubscribe.length) {
      ws.send(JSON.stringify({ action: "subscribe", trades: toSubscribe.map(toAlpacaSymbol) }));
    }
    currentSubscribed = wanted;
    console.log(`[price-stream] subscribed to ${wanted.size} US symbols`);
  }

  /**
   * Exactly one reconnect may ever be in flight. Without this guard a
   * terminate() plus the socket's own close, or a stale socket closing after
   * it had already been replaced, each start their own chain — and the
   * chains multiply until the account is hammering Alpaca continuously.
   */
  function scheduleReconnect(closed: WebSocket) {
    closed.removeAllListeners();
    if (closed !== ws) return; // a superseded socket finally closing — ignore
    if (reconnectPending) return;
    reconnectPending = true;
    ws = null;

    backoff.consecutiveFailures += 1;
    const delayMs = nextDelayMs(backoff);

    if (shouldLogFailure(backoff.consecutiveFailures)) {
      const explanation =
        backoff.lastErrorCode !== null ? describeStreamError(backoff.lastErrorCode) : null;
      const detail = explanation
        ? ` — ${explanation}`
        : backoff.lastErrorCode !== null
          ? ` — server error ${backoff.lastErrorCode}`
          : "";
      console.warn(
        `[price-stream] disconnected (attempt ${backoff.consecutiveFailures}), ` +
          `retrying in ${Math.round(delayMs / 1000)}s${detail}`,
      );
    }

    setTimeout(() => {
      reconnectPending = false;
      connect();
    }, delayMs);
  }

  async function healGaps() {
    const symbols = usSymbols();
    for (const symbol of symbols) {
      try {
        const res = await alpaca.getLatestTrade(symbol);
        if (res?.trade?.p) {
          writeLatestPrice({
            symbol,
            price: res.trade.p,
            marketOpen: true,
            source: "alpaca",
            delayed: false,
            currency: "USD",
          });
        }
      } catch (err) {
        console.error(`[price-stream] heal failed for ${symbol}:`, err);
      }
    }
  }

  connect();
  setInterval(resubscribe, RESUBSCRIBE_INTERVAL_MS);
  setInterval(healGaps, HEAL_INTERVAL_MS);
  setInterval(() => {
    // Only police a stream that actually got up and running. While we are
    // still failing to authenticate, scheduleReconnect owns the retry
    // timing — terminating here too would short-circuit its backoff.
    if (!authenticated || reconnectPending || !ws) return;
    if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      console.warn("[price-stream] heartbeat timeout, forcing reconnect");
      ws.terminate();
    }
  }, 15_000);
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
