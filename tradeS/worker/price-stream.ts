import WebSocket from "ws";
import { env } from "@/lib/env";
import { getTrackedSymbols } from "@/lib/tracked";
import { writeLatestPrice } from "@/lib/prices";
import { toAlpacaSymbol, toAppSymbol, isUsTicker } from "@/lib/alpaca/symbols";
import { alpaca } from "@/lib/alpaca/client";

const RESUBSCRIBE_INTERVAL_MS = 30_000;
const HEAL_INTERVAL_MS = 5 * 60_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;
const WRITE_THROTTLE_MS = 500;
const MAX_BACKOFF_MS = 30_000;

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
  let backoffMs = 1000;
  let lastHeartbeat = Date.now();
  let currentSubscribed = new Set<string>();
  const lastWriteAt = new Map<string, number>();

  function usSymbols(): string[] {
    return getTrackedSymbols().filter(isUsTicker);
  }

  function connect() {
    ws = new WebSocket(env.dataStreamUrl);

    ws.on("open", () => {
      console.log("[price-stream] connected, authenticating");
      ws!.send(JSON.stringify({ action: "auth", key: env.activeKeyId, secret: env.activeSecretKey }));
    });

    ws.on("message", (raw) => {
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

    ws.on("close", () => {
      console.warn("[price-stream] connection closed, reconnecting");
      scheduleReconnect();
    });

    ws.on("error", (err) => {
      console.error("[price-stream] error:", err);
    });
  }

  function handleMessage(msg: unknown) {
    if (typeof msg !== "object" || msg === null || !("T" in msg)) return;
    const m = msg as Record<string, unknown>;

    if (m.T === "success" && m.msg === "authenticated") {
      backoffMs = 1000;
      resubscribe();
      return;
    }
    if (m.T === "error") {
      console.error("[price-stream] server error:", m);
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
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
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

  function scheduleReconnect() {
    setTimeout(() => {
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      connect();
    }, backoffMs);
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
    if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      console.warn("[price-stream] heartbeat timeout, forcing reconnect");
      ws?.terminate();
    }
  }, 15_000);
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
