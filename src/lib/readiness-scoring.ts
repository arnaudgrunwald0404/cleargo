/**
 * New readiness scoring algorithm with:
 * 1. Signoff rule: If category signoff is GO, treat all criteria in that category as GO
 * 2. Fairness: Score per category, then average across categories (not raw questions)
 */

type Status = "GO" | "CONDITIONAL_GO" | "NO_GO" | "NOT_SET" | "NOT_APPLICABLE";

export interface CriterionInput {
  id: string;
  categoryId: string;
  isSignoff: boolean;
  status: Status;
  isGating: boolean;
  weight?: number;
}

export type Verdict =
  | "GO"
  | "CONDITIONAL_GO"
  | "AT_RISK"
  | "NO_GO_BLOCKED_BY_GATING"
  | "NOT_EVALUATED";

export interface CategoryScoreResult {
  categoryId: string;
  score: number;          // 0–1
  hasGatingNoGo: boolean;
  hasGatingUnvoted: boolean; // a gating criterion with no vote yet (NOT_SET)
  hasAnyNotSet: boolean;
}

export interface LaunchReadinessResult {
  readiness: number;      // 0–1
  readinessPct: number;   // 0–100
  blocked: boolean;
  verdict: Verdict;
  categoryScores: CategoryScoreResult[];
}

export interface LaunchReadinessOptions {
  /**
   * When true, a gating criterion with no vote (NOT_SET) is treated as hard as a
   * NO_GO: it blocks the launch (verdict NO_GO_BLOCKED_BY_GATING).
   *
   * When false (default), an unvoted gate instead forces an AT_RISK ceiling — the
   * verdict can never be GO/CONDITIONAL_GO, but the launch is not hard-blocked.
   *
   * This is switched on once an epic enters the "GTM Access and Prep" phase; see
   * recomputeEpicReadiness in src/lib/readiness.ts.
   */
  enforceUnvotedGatesAsNoGo?: boolean;
}

// Tunable knobs
const GATING_WEIGHT_MULTIPLIER = 3;

const NO_GO_GATING_CAP       = 0.60;
const CONDITIONAL_GATING_CAP = 0.85;
const NOT_SET_GATING_CAP     = 0.75;
const ANY_NOT_SET_CAP        = 0.95;

function statusToScore(status: Status): number {
  switch (status) {
    case "GO":
      return 1.0;
    case "CONDITIONAL_GO":
      return 0.5;
    case "NO_GO":
    case "NOT_SET":
    case "NOT_APPLICABLE":
    default:
      return 0.0;
  }
}

function computeCategoryScore(
  criteria: CriterionInput[],
  categoryId: string,
  enforceUnvotedGatesAsNoGo: boolean
): CategoryScoreResult {
  const inCategory = criteria.filter(c => c.categoryId === categoryId);
  if (inCategory.length === 0) {
    return { categoryId, score: 0, hasGatingNoGo: false, hasGatingUnvoted: false, hasAnyNotSet: false };
  }

  // 1. Find signoff and apply signoff override
  const signoff = inCategory.find(c => c.isSignoff);
  const useSignoffOverride = signoff && signoff.status === "GO";

  let hasGatingNoGo = false;
  let hasGatingConditional = false;
  let hasGatingNotSet = false;     // NOT_SET or NOT_APPLICABLE gate — caps score
  let hasGatingUnvoted = false;    // genuinely unvoted (NOT_SET) gate — blocks launch
  let hasAnyNotSet = false;

  let sumScores = 0;
  let sumWeights = 0;

  for (const c of inCategory) {
    const effectiveStatus: Status = useSignoffOverride ? "GO" : c.status;

    if (effectiveStatus === "NOT_APPLICABLE") {
      if (c.isGating) {
        hasGatingNotSet = true;
        hasAnyNotSet = true;
      }
      continue;
    }

    const score = statusToScore(effectiveStatus);

    const baseWeight = c.weight ?? 1;
    const effectiveWeight = c.isGating
      ? baseWeight * GATING_WEIGHT_MULTIPLIER
      : baseWeight;

    if (effectiveStatus === "NOT_SET") {
      hasAnyNotSet = true;
      if (c.isGating) {
        hasGatingNotSet = true;
        hasGatingUnvoted = true;
      }
    }

    if (c.isGating) {
      if (effectiveStatus === "NO_GO") hasGatingNoGo = true;
      if (effectiveStatus === "CONDITIONAL_GO") hasGatingConditional = true;
    }

    sumScores += score * effectiveWeight;
    sumWeights += effectiveWeight;
  }

  let score = sumWeights === 0 ? 0 : sumScores / sumWeights;

  // 2. Apply gating caps inside category.
  //    From GTM Access and Prep onward (enforceUnvotedGatesAsNoGo), an unvoted gate
  //    ("no vote" => NOT_SET) is treated as hard as a NO_GO and caps at the NO_GO cap.
  //    Before that phase it only caps at the NOT_SET cap (the verdict ceiling is
  //    applied at the launch level instead).
  if (hasGatingNoGo || (enforceUnvotedGatesAsNoGo && hasGatingUnvoted)) {
    score = Math.min(score, NO_GO_GATING_CAP);
  } else if (hasGatingConditional) {
    score = Math.min(score, CONDITIONAL_GATING_CAP);
  } else if (hasGatingNotSet) {
    // Remaining: pre-phase unvoted gate or a NOT_APPLICABLE gate — only caps.
    score = Math.min(score, NOT_SET_GATING_CAP);
  }

  // 3. Apply global "missing" cap for this category
  if (hasAnyNotSet) {
    score = Math.min(score, ANY_NOT_SET_CAP);
  }

  return {
    categoryId,
    score,
    hasGatingNoGo,
    hasGatingUnvoted,
    hasAnyNotSet,
  };
}

export function computeLaunchReadiness(
  criteria: CriterionInput[],
  options?: LaunchReadinessOptions
): LaunchReadinessResult {
  const enforceUnvotedGatesAsNoGo = options?.enforceUnvotedGatesAsNoGo ?? false;

  // Handle empty criteria
  if (criteria.length === 0) {
    return {
      readiness: 0,
      readinessPct: 0,
      blocked: false,
      verdict: "NOT_EVALUATED",
      categoryScores: [],
    };
  }

  // Group by categoryId
  const categoryIds = Array.from(new Set(criteria.map(c => c.categoryId)));

  const categoryScores: CategoryScoreResult[] = categoryIds.map(categoryId =>
    computeCategoryScore(criteria, categoryId, enforceUnvotedGatesAsNoGo)
  );

  // Fairness: each category has equal weight
  const activeCategories = categoryScores.length > 0
    ? categoryScores
    : [{ categoryId: "none", score: 0, hasGatingNoGo: false, hasGatingUnvoted: false, hasAnyNotSet: false }];

  let sumCategoryScores = 0;
  let sumCategoryWeights = 0;

  for (const cs of activeCategories) {
    const weight = 1; // could be customized later per category
    sumCategoryScores += cs.score * weight;
    sumCategoryWeights += weight;
  }

  const readiness = sumCategoryWeights === 0 ? 0 : sumCategoryScores / sumCategoryWeights;
  const readinessPct = Math.round(readiness * 100);

  const hasUnvotedGate = activeCategories.some(cs => cs.hasGatingUnvoted);

  // A launch is blocked by a gate voted NO_GO, or — once enforcement is on
  // (GTM Access and Prep onward) — by a gate with no vote at all.
  const blocked =
    activeCategories.some(cs => cs.hasGatingNoGo) ||
    (enforceUnvotedGatesAsNoGo && hasUnvotedGate);

  let verdict: Verdict;
  if (blocked) {
    verdict = "NO_GO_BLOCKED_BY_GATING";
  } else if (hasUnvotedGate) {
    // Pre-phase: an unvoted gate can't pass as GO/CONDITIONAL_GO — ceiling at AT_RISK.
    verdict = "AT_RISK";
  } else if (readiness >= 0.9) {
    verdict = "GO";
  } else if (readiness >= 0.7) {
    verdict = "CONDITIONAL_GO";
  } else {
    verdict = "AT_RISK";
  }

  return {
    readiness,
    readinessPct,
    blocked,
    verdict,
    categoryScores: activeCategories,
  };
}

/**
 * Helper function to detect if a criterion is a signoff criterion
 * Based on checking if the label contains "signoff" (case-insensitive)
 */
export function isSignoffCriterion(label: string | null | undefined): boolean {
  if (!label) return false;
  return label.toLowerCase().includes('signoff');
}

/**
 * Convert database status to our Status type
 */
export function normalizeStatus(status: string | null | undefined): Status {
  if (!status) return "NOT_SET";
  
  const normalized = status.toUpperCase().trim();
  
  // Handle variations
  if (normalized === "CONDITIONAL") return "CONDITIONAL_GO";
  if (normalized === "CONDITIONAL_GO") return "CONDITIONAL_GO";
  if (normalized === "GO") return "GO";
  if (normalized === "NO_GO") return "NO_GO";
  if (normalized === "NOT_SET") return "NOT_SET";
  if (normalized === "NOT_APPLICABLE" || normalized === "NA" || normalized === "N/A") return "NOT_APPLICABLE";

  return "NOT_SET";
}

