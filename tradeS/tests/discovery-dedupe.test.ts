import { describe, it, expect } from "vitest";
import { filterPicks, isUsListed } from "@/lib/discovery/dedupe";
import type { DiscoveryPick } from "@/lib/discovery/schema";

function pick(symbol: string): DiscoveryPick {
  return {
    symbol,
    companyName: `${symbol} Corp`,
    angle: "second-order",
    theme: "theme",
    thesis: "x".repeat(80),
    whyOverlooked: "overlooked",
    catalysts: ["c"],
    risks: ["r"],
    sources: [{ title: "s", url: "https://e.com" }],
    confidence: 5,
    horizonDays: 60,
  };
}

describe("isUsListed", () => {
  it("accepts plain US tickers, rejects suffixed foreign ones", () => {
    expect(isUsListed("ACME")).toBe(true);
    expect(isUsListed("TD.TO")).toBe(false);
    expect(isUsListed("2330.TW")).toBe(false);
  });
});

describe("filterPicks", () => {
  it("drops non-US suffixed listings with a reason", () => {
    const res = filterPicks([pick("SHOP.TO")], new Set());
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0].reason).toContain("non-US");
  });

  it("drops excluded symbols case-insensitively", () => {
    const res = filterPicks([pick("acme")], new Set(["ACME"]));
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0].reason).toContain("already tracked");
  });

  it("drops in-batch duplicates (keeps the first)", () => {
    const res = filterPicks([pick("DUP"), pick("dup")], new Set());
    expect(res.kept).toHaveLength(1);
    expect(res.kept[0].symbol).toBe("DUP");
    expect(res.dropped[0].reason).toContain("duplicate");
  });

  it("keeps clean picks and reports every drop reason", () => {
    const res = filterPicks([pick("GOOD"), pick("BAD.L"), pick("GOOD")], new Set(["OTHER"]));
    expect(res.kept.map((p) => p.symbol)).toEqual(["GOOD"]);
    expect(res.dropped).toHaveLength(2);
  });
});
