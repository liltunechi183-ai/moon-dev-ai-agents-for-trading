import WebSocket from "ws";
import { env } from "@/lib/env";
import type { AlpacaOrder } from "./client";

export interface TradeUpdateEvent {
  event: string; // "fill" | "partial_fill" | "new" | "canceled" | ...
  order: AlpacaOrder;
  timestamp?: string;
  price?: string;
  qty?: string;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * The Alpaca trade_updates websocket (a SEPARATE connection from the
 * market-data stream; worker-only). Calls onUpdate for every order event.
 */
export function connectTradeStream(onUpdate: (event: TradeUpdateEvent) => void): void {
  if (!env.hasAlpacaKeys) return;
  let backoffMs = 1000;

  function connect() {
    const ws = new WebSocket(env.tradeStreamUrl);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          action: "authenticate",
          data: { key_id: env.activeKeyId, secret_key: env.activeSecretKey },
        }),
      );
    });

    ws.on("message", (rawData) => {
      let msg: { stream?: string; data?: Record<string, unknown> };
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        return;
      }
      if (msg.stream === "authorization") {
        const status = (msg.data as { status?: string } | undefined)?.status;
        if (status === "authorized") {
          backoffMs = 1000;
          ws.send(JSON.stringify({ action: "listen", data: { streams: ["trade_updates"] } }));
          console.log("[trade-stream] authorized, listening for trade updates");
        } else {
          console.error("[trade-stream] authorization failed:", msg.data);
        }
        return;
      }
      if (msg.stream === "trade_updates" && msg.data) {
        onUpdate(msg.data as unknown as TradeUpdateEvent);
      }
    });

    ws.on("close", () => {
      console.warn("[trade-stream] closed, reconnecting");
      setTimeout(() => {
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        connect();
      }, backoffMs);
    });

    ws.on("error", (err) => {
      console.error("[trade-stream] error:", err);
    });
  }

  connect();
}
