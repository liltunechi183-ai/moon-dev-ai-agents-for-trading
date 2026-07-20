export type Outlook = "bullish" | "neutral" | "bearish";

export interface PairedSample {
  /** Both strategies answered the SAME symbol+date. */
  championCorrect: boolean;
  challengerCorrect: boolean;
  championOutlook: Outlook;
  challengerOutlook: Outlook;
  /** Return actually observed over the window (same for both). */
  returnPct: number;
  /** Confidence 0-10 each strategy assigned (for Brier). */
  championConfidence: number;
  challengerConfidence: number;
  regime: string | null;
}

export interface RegimeBucket {
  regime: string;
  championWinRate: number;
  challengerWinRate: number;
  samples: number;
}

export interface Scorecard {
  pairs: number;
  minPairs: number;
  enoughSamples: boolean;

  // Discordant dominance: pairs where exactly one was right carry the signal.
  discordant: number;
  challengerWins: number; // challenger right, champion wrong
  championWins: number; // champion right, challenger wrong
  discordantWinRate: number | null; // challengerWins / discordant

  // Neutral share (Goodhart guard): a strategist maximizing raw accuracy
  // could drift neutral-heavy in chop, so cap the neutral share.
  challengerNeutralShare: number;
  neutralShareOk: boolean;

  // Brier calibration must not worsen (lower is better).
  championBrier: number;
  challengerBrier: number;
  brierOk: boolean;

  // Per-regime no-catastrophe guard.
  regimeBuckets: RegimeBucket[];
  regimeCatastrophe: boolean;

  passed: boolean;
  verdict: string;
}

const DISCORDANT_DOMINANCE = 0.65;
const MIN_DISCORDANT = 8;
const NEUTRAL_CEILING = 0.6; // reject a challenger that drifts neutral-heavy
const REGIME_MIN_SAMPLES = 10;
const REGIME_CATASTROPHE_DROP = 0.15; // >15pt worse in a well-sampled regime = reject

/** Confidence 0-10 → probability the directional call is right (naive: c/10,
 * floored at 0.5 for a directional call, 0.5 flat for neutral). */
function impliedProb(outlook: Outlook, confidence: number): number {
  if (outlook === "neutral") return 0.5;
  return 0.5 + (Math.min(10, Math.max(0, confidence)) / 10) * 0.5;
}

/** Brier score over a sample set (lower = better calibrated). Uses absolute
 * error correctly — a naive accuracy metric rewards overconfidence. */
function brier(samples: PairedSample[], side: "champion" | "challenger"): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) {
    const outlook = side === "champion" ? s.championOutlook : s.challengerOutlook;
    const confidence = side === "champion" ? s.championConfidence : s.challengerConfidence;
    const correct = side === "champion" ? s.championCorrect : s.challengerCorrect;
    const p = impliedProb(outlook, confidence);
    const actual = correct ? 1 : 0;
    sum += (p - actual) ** 2;
  }
  return sum / samples.length;
}

/**
 * PURE scorecard math. Promotion requires ALL of: enough pairs, discordant
 * dominance, a sane neutral share, non-worsening Brier, and no per-regime
 * catastrophe. This strictness is the whole point — a loose gate makes the
 * version number random-walk upward while the accuracy panel "confirms"
 * noise.
 */
export function computeScorecard(samples: PairedSample[], minPairs: number): Scorecard {
  const pairs = samples.length;
  const enoughSamples = pairs >= minPairs;

  const discordantSamples = samples.filter((s) => s.championCorrect !== s.challengerCorrect);
  const discordant = discordantSamples.length;
  const challengerWins = discordantSamples.filter((s) => s.challengerCorrect).length;
  const championWins = discordant - challengerWins;
  const discordantWinRate = discordant > 0 ? challengerWins / discordant : null;

  const challengerNeutrals = samples.filter((s) => s.challengerOutlook === "neutral").length;
  const challengerNeutralShare = pairs > 0 ? challengerNeutrals / pairs : 0;
  const neutralShareOk = challengerNeutralShare <= NEUTRAL_CEILING;

  const championBrier = brier(samples, "champion");
  const challengerBrier = brier(samples, "challenger");
  const brierOk = challengerBrier <= championBrier + 0.02; // small tolerance

  // Per-regime buckets.
  const regimes = new Map<string, PairedSample[]>();
  for (const s of samples) {
    if (!s.regime) continue;
    if (!regimes.has(s.regime)) regimes.set(s.regime, []);
    regimes.get(s.regime)!.push(s);
  }
  const regimeBuckets: RegimeBucket[] = [...regimes.entries()].map(([regime, group]) => ({
    regime,
    championWinRate: group.filter((s) => s.championCorrect).length / group.length,
    challengerWinRate: group.filter((s) => s.challengerCorrect).length / group.length,
    samples: group.length,
  }));
  const regimeCatastrophe = regimeBuckets.some(
    (b) =>
      b.samples >= REGIME_MIN_SAMPLES &&
      b.challengerWinRate < b.championWinRate - REGIME_CATASTROPHE_DROP,
  );

  const dominanceOk =
    discordant >= MIN_DISCORDANT &&
    discordantWinRate !== null &&
    discordantWinRate >= DISCORDANT_DOMINANCE;

  const passed = enoughSamples && dominanceOk && neutralShareOk && brierOk && !regimeCatastrophe;

  let verdict: string;
  if (!enoughSamples) verdict = `Needs ${minPairs} pairs, has ${pairs}.`;
  else if (discordant < MIN_DISCORDANT) verdict = `Only ${discordant} disagreements — need ${MIN_DISCORDANT}.`;
  else if (!dominanceOk)
    verdict = `Challenger won ${((discordantWinRate ?? 0) * 100).toFixed(0)}% of disagreements (need ${(DISCORDANT_DOMINANCE * 100).toFixed(0)}%).`;
  else if (!neutralShareOk) verdict = `Neutral share ${(challengerNeutralShare * 100).toFixed(0)}% is too high (drifting neutral).`;
  else if (!brierOk) verdict = "Calibration (Brier) got worse.";
  else if (regimeCatastrophe) verdict = "Materially worse in at least one regime.";
  else verdict = "Challenger beats the champion — promote.";

  return {
    pairs,
    minPairs,
    enoughSamples,
    discordant,
    challengerWins,
    championWins,
    discordantWinRate,
    challengerNeutralShare,
    neutralShareOk,
    championBrier,
    challengerBrier,
    brierOk,
    regimeBuckets,
    regimeCatastrophe,
    passed,
    verdict,
  };
}

export {
  DISCORDANT_DOMINANCE,
  MIN_DISCORDANT,
  NEUTRAL_CEILING,
  REGIME_MIN_SAMPLES,
  REGIME_CATASTROPHE_DROP,
};
