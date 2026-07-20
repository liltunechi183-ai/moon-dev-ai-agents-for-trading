import { describe, it, expect } from "vitest";
import { parseDiscovery } from "@/lib/discovery/schema";

function validPick(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "ACME",
    companyName: "Acme Widgets",
    angle: "second-order",
    theme: "AI datacenter cooling",
    thesis: "Acme makes the niche liquid-cooling valves that every datacenter buildout needs, and the crowd is buying the chipmakers instead.",
    whyOverlooked: "Too small to show up in the datacenter headlines.",
    catalysts: ["new plant online Q3"],
    risks: ["customer concentration"],
    sources: [{ title: "10-K", url: "https://example.com" }],
    confidence: 6,
    horizonDays: 60,
    ...overrides,
  };
}

describe("parseDiscovery", () => {
  it("parses a valid 1-4 pick payload, tolerating code fences", () => {
    const res = parseDiscovery("```json\n" + JSON.stringify({ picks: [validPick()] }) + "\n```");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.output.picks).toHaveLength(1);
  });

  it("rejects an empty picks array", () => {
    const res = parseDiscovery(JSON.stringify({ picks: [] }));
    expect(res.ok).toBe(false);
  });

  it("rejects more than 4 picks", () => {
    const res = parseDiscovery(JSON.stringify({ picks: Array.from({ length: 5 }, () => validPick()) }));
    expect(res.ok).toBe(false);
  });

  it("requires at least one source (unusable evidence otherwise)", () => {
    const res = parseDiscovery(JSON.stringify({ picks: [validPick({ sources: [] })] }));
    expect(res.ok).toBe(false);
  });

  it("rejects a too-short thesis", () => {
    const res = parseDiscovery(JSON.stringify({ picks: [validPick({ thesis: "too short" })] }));
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown angle", () => {
    const res = parseDiscovery(JSON.stringify({ picks: [validPick({ angle: "vibes" })] }));
    expect(res.ok).toBe(false);
  });

  it("rejects a horizon outside 14-120 days", () => {
    expect(parseDiscovery(JSON.stringify({ picks: [validPick({ horizonDays: 5 })] })).ok).toBe(false);
    expect(parseDiscovery(JSON.stringify({ picks: [validPick({ horizonDays: 200 })] })).ok).toBe(false);
  });

  it("returns an error when there is no JSON object", () => {
    const res = parseDiscovery("I found some great stocks but forgot the JSON.");
    expect(res.ok).toBe(false);
  });
});
