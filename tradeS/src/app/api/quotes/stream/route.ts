import { db, tables } from "@/lib/db";
import { alpaca } from "@/lib/alpaca/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const POLL_MS = 1000;
const CLOCK_MS = 30_000;
const HEARTBEAT_MS = 15_000;

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      }

      async function sendClock() {
        if (!env.hasAlpacaKeys) {
          send("clock", { isOpen: null, source: "unknown" });
          return;
        }
        try {
          const clock = await alpaca.getClock();
          send("clock", { isOpen: clock.is_open, nextOpen: clock.next_open, nextClose: clock.next_close });
        } catch {
          // degrade quietly — the UI just won't get a fresh clock this tick
        }
      }

      function sendQuotes() {
        const rows = db.select().from(tables.latestPrices).all();
        send("quotes", rows);
      }

      sendQuotes();
      sendClock();

      const quotesTimer = setInterval(sendQuotes, POLL_MS);
      const clockTimer = setInterval(() => void sendClock(), CLOCK_MS);
      const heartbeatTimer = setInterval(() => send("heartbeat", { ts: Date.now() }), HEARTBEAT_MS);

      const cleanup = () => {
        closed = true;
        clearInterval(quotesTimer);
        clearInterval(clockTimer);
        clearInterval(heartbeatTimer);
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
