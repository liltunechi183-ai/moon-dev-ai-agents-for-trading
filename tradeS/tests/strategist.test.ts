import { describe, it, expect } from "vitest";
import {
  validateProposal,
  isActionableCluster,
  checkStrategistGate,
  MIN_LESSONS,
} from "@/lib/improve/strategist";

const PARENT_FULL = "A".repeat(1000);
const PARENT_QUANT = "B".repeat(500);

function base() {
  return {
    parentFullText: PARENT_FULL,
    parentQuantText: PARENT_QUANT,
    proposedFullText: PARENT_FULL,
    proposedQuantText: PARENT_QUANT,
    tier: "full" as const,
    changeSummary: "A concrete, bounded change to the confidence rubric.",
  };
}

describe("validateProposal", () => {
  it("rejects a no-op proposal", () => {
    const res = validateProposal(base());
    expect(res.ok).toBe(false);
  });

  it("accepts a bounded change to the declared tier", () => {
    const res = validateProposal({ ...base(), proposedFullText: "A".repeat(1200) });
    expect(res.ok).toBe(true);
  });

  it("rejects when the unchanged tier is not byte-identical", () => {
    const res = validateProposal({
      ...base(),
      proposedFullText: "A".repeat(1200),
      proposedQuantText: PARENT_QUANT + "x", // quant must stay identical for tier=full
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a rewrite that is too long", () => {
    const res = validateProposal({ ...base(), proposedFullText: "A".repeat(2000) });
    expect(res.ok).toBe(false);
  });

  it("rejects a change that is too short (gutted)", () => {
    const res = validateProposal({ ...base(), proposedFullText: "A".repeat(400) });
    expect(res.ok).toBe(false);
  });

  it("rejects tier mismatch (declares full but quant changed)", () => {
    const res = validateProposal({
      ...base(),
      tier: "full",
      proposedQuantText: "B".repeat(600),
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a too-short change summary", () => {
    const res = validateProposal({
      ...base(),
      proposedFullText: "A".repeat(1200),
      changeSummary: "tweak",
    });
    expect(res.ok).toBe(false);
  });
});

describe("isActionableCluster", () => {
  it("is actionable when it recurs >= 5 times", () => {
    expect(isActionableCluster({ rootCause: "overconfidence", count: 5, regimes: new Set(["bull-calm"]) })).toBe(true);
  });
  it("is actionable when it spans >= 2 regimes", () => {
    expect(
      isActionableCluster({ rootCause: "regime-blindness", count: 2, regimes: new Set(["bull-calm", "bear"]) }),
    ).toBe(true);
  });
  it("is not actionable when rare and single-regime", () => {
    expect(isActionableCluster({ rootCause: "other", count: 3, regimes: new Set(["chop"]) })).toBe(false);
  });
});

describe("checkStrategistGate", () => {
  const clusters = [{ rootCause: "overconfidence", count: 6, regimes: new Set(["bull-calm"]) }];

  it("passes when everything is satisfied", () => {
    const res = checkStrategistGate({
      challengerAlreadyTesting: false,
      unprocessedProposal: false,
      lessonCount: MIN_LESSONS,
      clusters,
    });
    expect(res.ok).toBe(true);
  });

  it("blocks when a challenger is already testing", () => {
    const res = checkStrategistGate({
      challengerAlreadyTesting: true,
      unprocessedProposal: false,
      lessonCount: 20,
      clusters,
    });
    expect(res.ok).toBe(false);
  });

  it("blocks with too few lessons", () => {
    const res = checkStrategistGate({
      challengerAlreadyTesting: false,
      unprocessedProposal: false,
      lessonCount: MIN_LESSONS - 1,
      clusters,
    });
    expect(res.ok).toBe(false);
  });

  it("blocks without an actionable cluster", () => {
    const res = checkStrategistGate({
      challengerAlreadyTesting: false,
      unprocessedProposal: false,
      lessonCount: 20,
      clusters: [{ rootCause: "other", count: 2, regimes: new Set(["chop"]) }],
    });
    expect(res.ok).toBe(false);
  });
});
