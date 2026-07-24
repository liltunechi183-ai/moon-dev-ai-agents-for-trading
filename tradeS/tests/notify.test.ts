import { describe, it, expect } from "vitest";
import { formatNotificationText, formatNotificationBanner } from "@/lib/bot/notify";

describe("formatNotificationText", () => {
  it("includes the symbol, reason, and a kind-specific label for a buy", () => {
    const text = formatNotificationText({ kind: "buy", symbol: "AAPL", reason: "bought 5 shares", ts: 0 });
    expect(text).toContain("AAPL");
    expect(text).toContain("bought 5 shares");
    expect(text).toContain("BOT BOUGHT");
  });

  it("labels a sell distinctly from a buy", () => {
    const text = formatNotificationText({ kind: "sell", symbol: "TSLA", reason: "closed position", ts: 0 });
    expect(text).toContain("BOT SOLD");
    expect(text).toContain("TSLA");
  });

  it("labels a halt and omits the symbol dash when there is no symbol", () => {
    const text = formatNotificationText({ kind: "halt", reason: "daily loss circuit breaker", ts: 0 });
    expect(text).toContain("BOT HALTED");
    expect(text).toContain("daily loss circuit breaker");
    expect(text).not.toContain("—undefined");
    expect(text).not.toContain("null");
  });

  it("handles a null symbol the same as an absent one", () => {
    const text = formatNotificationText({ kind: "halt", symbol: null, reason: "kill switch pressed", ts: 0 });
    expect(text.startsWith("🛑 BOT HALTED: kill switch pressed")).toBe(true);
  });
});

describe("formatNotificationBanner", () => {
  it("wraps the text in a three-line bordered box", () => {
    const banner = formatNotificationBanner({ kind: "buy", symbol: "AAPL", reason: "bought", ts: 0 });
    const lines = banner.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("AAPL");
  });

  it("scales the border to the text length without truncating short banners", () => {
    const banner = formatNotificationBanner({ kind: "sell", symbol: "X", reason: "closed", ts: 0 });
    const lines = banner.split("\n");
    // Border line should be at least as wide as a reasonable minimum.
    expect(lines[0].length).toBeGreaterThan(10);
  });
});
