export interface ProposalValidationInput {
  parentFullText: string;
  parentQuantText: string;
  proposedFullText: string;
  proposedQuantText: string;
  tier: "quant" | "full" | "both";
  changeSummary: string;
}

export type ProposalValidation = { ok: true } | { ok: false; reason: string };

const MIN_LEN_RATIO = 0.6;
const MAX_LEN_RATIO = 1.7;

/**
 * Structural validation of a strategist proposal (PURE). The UNCHANGED
 * tier's text must be byte-identical to the parent's; the CHANGED tier's
 * text must be within 0.6-1.7x the parent length — a bounded change, not a
 * rewrite.
 */
export function validateProposal(input: ProposalValidationInput): ProposalValidation {
  const fullChanged = input.proposedFullText !== input.parentFullText;
  const quantChanged = input.proposedQuantText !== input.parentQuantText;

  if (!fullChanged && !quantChanged) {
    return { ok: false, reason: "proposal changes nothing" };
  }
  if (input.changeSummary.trim().length < 10) {
    return { ok: false, reason: "change summary is too short to be a real hypothesis" };
  }

  // Tier consistency: the declared tier must match what actually changed.
  if (input.tier === "full" && quantChanged) {
    return { ok: false, reason: "tier=full but the quant text changed" };
  }
  if (input.tier === "quant" && fullChanged) {
    return { ok: false, reason: "tier=quant but the full text changed" };
  }

  // The unchanged tier must be byte-identical.
  if (input.tier === "full" && input.proposedQuantText !== input.parentQuantText) {
    return { ok: false, reason: "unchanged quant tier is not byte-identical to the parent" };
  }
  if (input.tier === "quant" && input.proposedFullText !== input.parentFullText) {
    return { ok: false, reason: "unchanged full tier is not byte-identical to the parent" };
  }

  // Bounded length on each changed tier.
  const withinBounds = (parent: string, proposed: string): boolean => {
    const ratio = proposed.length / Math.max(1, parent.length);
    return ratio >= MIN_LEN_RATIO && ratio <= MAX_LEN_RATIO;
  };
  if (fullChanged && !withinBounds(input.parentFullText, input.proposedFullText)) {
    return { ok: false, reason: "full text change is outside 0.6-1.7x the parent length" };
  }
  if (quantChanged && !withinBounds(input.parentQuantText, input.proposedQuantText)) {
    return { ok: false, reason: "quant text change is outside 0.6-1.7x the parent length" };
  }

  return { ok: true };
}

export interface LessonCluster {
  rootCause: string;
  count: number;
  regimes: Set<string>;
}

/** A cluster is actionable when it recurs >= 5 times OR spans >= 2 regimes. */
export function isActionableCluster(cluster: LessonCluster): boolean {
  return cluster.count >= 5 || cluster.regimes.size >= 2;
}

export interface StrategistGateInput {
  challengerAlreadyTesting: boolean;
  unprocessedProposal: boolean;
  lessonCount: number;
  clusters: LessonCluster[];
}

export const MIN_LESSONS = 8;

export type GateResult = { ok: true } | { ok: false; reason: string };

/** Hard gate before we even ask the LLM for a proposal. */
export function checkStrategistGate(input: StrategistGateInput): GateResult {
  if (input.challengerAlreadyTesting) return { ok: false, reason: "a challenger is already in testing" };
  if (input.unprocessedProposal) return { ok: false, reason: "an unprocessed proposal exists" };
  if (input.lessonCount < MIN_LESSONS) {
    return { ok: false, reason: `only ${input.lessonCount} lessons (need ${MIN_LESSONS})` };
  }
  if (!input.clusters.some(isActionableCluster)) {
    return { ok: false, reason: "no actionable lesson cluster (recurs >=5 or spans >=2 regimes)" };
  }
  return { ok: true };
}

export { MIN_LEN_RATIO, MAX_LEN_RATIO };
