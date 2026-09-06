import { describe, it, expect } from "vitest";
import { buildNtfyRequest, toHeaderSafe } from "@/lib/bot/ntfy";
import type { NotifyEvent } from "@/lib/bot/notify";

const config = { server: "https://ntfy.sh", topic: "charly183-pmterminal" };

const buy: NotifyEvent = {
  kind: "buy",
  symbol: "AAPL",
  reason: "Primer Salto — checklist met — 7 shares (~$600, risking $24, bound by position-cap)",
};

describe("toHeaderSafe", () => {
  it("replaces the em dash this codebase writes everywhere", () => {
    // Not cosmetic: a non-ASCII byte in a header makes fetch throw, and this
    // runs inside the entry loop.
    expect(toHeaderSafe("Primer Salto — met")).toBe("Primer Salto - met");
  });

  it("leaves plain ASCII exactly as it was", () => {
    expect(toHeaderSafe("TradeS BOUGHT AAPL")).toBe("TradeS BOUGHT AAPL");
  });

  it("turns any remaining non-ASCII into a space, never into nothing", () => {
    // "añoJUMP" collapsing to "aoJUMP" would join two words silently.
    expect(toHeaderSafe("año JUMP")).toBe("a o JUMP");
  });

  it("produces only header-legal bytes for anything thrown at it", () => {
    for (const nasty of ["señal 🚀 lista", "日本株", "a\nb\tc", "quote “x” and ‘y’"]) {
      expect(toHeaderSafe(nasty)).toMatch(/^[\x20-\x7E]*$/);
    }
  });

  it("strips the newlines that would let a value forge a second header", () => {
    const forged = toHeaderSafe("title\r\nX-Injected: yes");
    expect(forged).not.toContain("\n");
    expect(forged).not.toContain("\r");
  });

  it("truncates over-long values within the limit", () => {
    const long = toHeaderSafe("x".repeat(500), 50);
    expect(long.length).toBeLessThanOrEqual(50);
  });

  it("collapses runs of whitespace rather than leaving ragged gaps", () => {
    expect(toHeaderSafe("  a    b  ")).toBe("a b");
  });
});

describe("buildNtfyRequest", () => {
  it("posts to the topic with a readable title and the reason as the body", () => {
    const request = buildNtfyRequest(buy, config)!;
    expect(request.url).toBe("https://ntfy.sh/charly183-pmterminal");
    expect(request.headers.Title).toBe("TradeS BOUGHT AAPL");
    // The body is UTF-8 and keeps the text as written — accents included.
    expect(request.body).toBe(buy.reason);
    expect(request.body).toContain("—");
  });

  it("sends nothing at all when no topic is configured", () => {
    // The terminal banner is the baseline; push is strictly opt-in.
    expect(buildNtfyRequest(buy, null)).toBeNull();
    expect(buildNtfyRequest(buy, { server: "https://ntfy.sh", topic: "" })).toBeNull();
  });

  it("marks a halt more urgently than a fill", () => {
    const halt = buildNtfyRequest({ kind: "halt", symbol: "TSLA", reason: "daily loss limit" }, config)!;
    expect(halt.headers.Priority).toBe("5");
    expect(Number(halt.headers.Priority)).toBeGreaterThan(Number(buildNtfyRequest(buy, config)!.headers.Priority));
    expect(halt.headers.Tags).toContain("rotating_light");
  });

  it("distinguishes a buy from a sell at a glance", () => {
    const sell = buildNtfyRequest({ kind: "sell", symbol: "MSFT", reason: "20 sessions held" }, config)!;
    expect(sell.headers.Title).toBe("TradeS SOLD MSFT");
    expect(sell.headers.Tags).not.toBe(buildNtfyRequest(buy, config)!.headers.Tags);
  });

  it("copes with an event that names no symbol", () => {
    const request = buildNtfyRequest({ kind: "halt", reason: "kill switch pressed" }, config)!;
    expect(request.headers.Title).toBe("TradeS HALTED");
  });

  it("does not double the slash when the server URL has a trailing one", () => {
    const request = buildNtfyRequest(buy, { server: "https://ntfy.sh/", topic: "t" })!;
    expect(request.url).toBe("https://ntfy.sh/t");
  });

  it("honours a self-hosted server", () => {
    const request = buildNtfyRequest(buy, { server: "https://push.example.com", topic: "t" })!;
    expect(request.url).toBe("https://push.example.com/t");
  });

  it("never emits a header value fetch would reject", () => {
    const messy: NotifyEvent = {
      kind: "buy",
      symbol: "BRK-B",
      reason: "señal 🚀 — comprado a $412,50\ncon riesgo del 0,8%",
    };
    for (const value of Object.values(buildNtfyRequest(messy, config)!.headers)) {
      expect(value).toMatch(/^[\x20-\x7E]*$/);
    }
  });
});
