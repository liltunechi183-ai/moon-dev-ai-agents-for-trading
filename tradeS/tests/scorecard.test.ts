import { describe, it, expect } from "vitest";
import { computeScorecard, type PairedSample } from "@/lib/improve/scorecard";

function sample(overrides: Partial<PairedSample> = {}): PairedSample {
  return {
    championCorrect: false,
    challengerCorrect: true,
    championOutlook: "bullish",
    challengerOutlook: "bullish",
    returnPct: 5,
    championConfidence: 5,
    challengerConfidence: 5,
    regime: "bull-calm",
    ...overrides,
  };
}

describe("computeScorecard", () => {
  it("fails when there are not enough pairs", () => {
    const sc = computeScorecard([sample(), sample()], 60);
    expect(sc.enoughSamples).toBe(false);
    expect(sc.passed).toBe(false);
    expect(sc.verdict).toContain("60");
  });

  it("passes on clear discordant dominance with clean guards", () => {
    // 60 pairs: 20 discordant where challenger wins 16 (80%), rest concordant.
    const samples: PairedSample[] = [];
    for (let i = 0; i < 16; i++) samples.push(sample({ championCorrect: false, challengerCorrect: true }));
    for (let i = 0; i < 4; i++) samples.push(sample({ championCorrect: true, challengerCorrect: false }));
    // Concordant (both right) — carry no signal, but keep neutral share sane.
    for (let i = 0; i < 40; i++)
      samples.push(sample({ championCorrect: true, challengerCorrect: true }));
    const sc = computeScorecard(samples, 60);
    expect(sc.discordant).toBe(20);
    expect(sc.discordantWinRate).toBeCloseTo(0.8);
    expect(sc.passed).toBe(true);
  });

  it("concordant pairs carry no signal (both right or both wrong)", () => {
    const samples: PairedSample[] = [];
    for (let i = 0; i < 60; i++)
      samples.push(sample({ championCorrect: true, challengerCorrect: true }));
    const sc = computeScorecard(samples, 60);
    expect(sc.discordant).toBe(0);
    expect(sc.passed).toBe(false);
  });

  it("rejects a challenger that only ties in disagreements", () => {
    const samples: PairedSample[] = [];
    for (let i = 0; i < 10; i++) samples.push(sample({ championCorrect: false, challengerCorrect: true }));
    for (let i = 0; i < 10; i++) samples.push(sample({ championCorrect: true, challengerCorrect: false }));
    for (let i = 0; i < 40; i++) samples.push(sample({ championCorrect: true, challengerCorrect: true }));
    const sc = computeScorecard(samples, 60);
    expect(sc.discordantWinRate).toBeCloseTo(0.5);
    expect(sc.passed).toBe(false);
  });

  it("accepts a purely directional challenger (0% neutral is fine)", () => {
    const samples: PairedSample[] = [];
    for (let i = 0; i < 16; i++) samples.push(sample({ championCorrect: false, challengerCorrect: true }));
    for (let i = 0; i < 4; i++) samples.push(sample({ championCorrect: true, challengerCorrect: false }));
    for (let i = 0; i < 40; i++) samples.push(sample({ championCorrect: true, challengerCorrect: true }));
    const sc = computeScorecard(samples, 60);
    expect(sc.challengerNeutralShare).toBe(0);
    expect(sc.neutralShareOk).toBe(true);
    expect(sc.passed).toBe(true);
  });

  it("rejects a neutral-heavy challenger (Goodhart guard)", () => {
    const samples: PairedSample[] = [];
    // Challenger wins the disagreements but is neutral almost everywhere
    // (>60% neutral share trips the ceiling).
    for (let i = 0; i < 16; i++)
      samples.push(sample({ championCorrect: false, challengerCorrect: true, challengerOutlook: "neutral" }));
    for (let i = 0; i < 4; i++)
      samples.push(sample({ championCorrect: true, challengerCorrect: false, challengerOutlook: "neutral" }));
    for (let i = 0; i < 40; i++)
      samples.push(sample({ championCorrect: true, challengerCorrect: true, challengerOutlook: "neutral" }));
    const sc = computeScorecard(samples, 60);
    expect(sc.challengerNeutralShare).toBeGreaterThan(0.6);
    expect(sc.neutralShareOk).toBe(false);
    expect(sc.passed).toBe(false);
  });

  it("rejects on a per-regime catastrophe even with a good average", () => {
    const samples: PairedSample[] = [];
    // Strong in bull-calm...
    for (let i = 0; i < 16; i++)
      samples.push(sample({ regime: "bull-calm", championCorrect: false, challengerCorrect: true }));
    for (let i = 0; i < 30; i++)
      samples.push(sample({ regime: "bull-calm", championCorrect: true, challengerCorrect: true }));
    // ...but a disaster in bear (challenger far worse, well sampled).
    for (let i = 0; i < 14; i++)
      samples.push(sample({ regime: "bear", championCorrect: true, challengerCorrect: false }));
    const sc = computeScorecard(samples, 60);
    expect(sc.regimeCatastrophe).toBe(true);
    expect(sc.passed).toBe(false);
  });

  it("Brier penalizes overconfidence: a more-overconfident challenger scores worse", () => {
    // Both wrong on every pair; challenger is maximally overconfident (10),
    // champion is humble (0). Absolute error must rank challenger worse.
    const samples: PairedSample[] = [];
    for (let i = 0; i < 30; i++)
      samples.push(
        sample({
          championCorrect: false,
          challengerCorrect: false,
          championConfidence: 0,
          challengerConfidence: 10,
        }),
      );
    const sc = computeScorecard(samples, 30);
    expect(sc.challengerBrier).toBeGreaterThan(sc.championBrier);
    expect(sc.brierOk).toBe(false);
  });
});
