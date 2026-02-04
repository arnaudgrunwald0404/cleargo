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
  hasAnyNotSet: boolean;
}

export interface LaunchReadinessResult {
  readiness: number;      // 0–1
  readinessPct: number;   // 0–100
  blocked: boolean;
  verdict: Verdict;
  categoryScores: CategoryScoreResult[];
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

function computeCategoryScore(criteria: CriterionInput[], categoryId: string): CategoryScoreResult {
  const inCategory = criteria.filter(c => c.categoryId === categoryId);
  if (inCategory.length === 0) {
    return { categoryId, score: 0, hasGatingNoGo: false, hasAnyNotSet: false };
  }

  // 1. Find signoff and apply signoff override
  const signoff = inCategory.find(c => c.isSignoff);
  const useSignoffOverride = signoff && signoff.status === "GO";

  let hasGatingNoGo = false;
  let hasGatingConditional = false;
  let hasGatingNotSet = false;
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
      if (c.isGating) hasGatingNotSet = true;
    }

    if (c.isGating) {
      if (effectiveStatus === "NO_GO") hasGatingNoGo = true;
      if (effectiveStatus === "CONDITIONAL_GO") hasGatingConditional = true;
    }

    sumScores += score * effectiveWeight;
    sumWeights += effectiveWeight;
  }

  let score = sumWeights === 0 ? 0 : sumScores / sumWeights;

  // 2. Apply gating caps inside category
  if (hasGatingNoGo) {
    score = Math.min(score, NO_GO_GATING_CAP);
  } else if (hasGatingConditional) {
    score = Math.min(score, CONDITIONAL_GATING_CAP);
  } else if (hasGatingNotSet) {
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
    hasAnyNotSet,
  };
}

export function computeLaunchReadiness(criteria: CriterionInput[]): LaunchReadinessResult {
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
    computeCategoryScore(criteria, categoryId)
  );

  // Fairness: each category has equal weight
  const activeCategories = categoryScores.length > 0 
    ? categoryScores 
    : [{ categoryId: "none", score: 0, hasGatingNoGo: false, hasAnyNotSet: false }];

  let sumCategoryScores = 0;
  let sumCategoryWeights = 0;

  for (const cs of activeCategories) {
    const weight = 1; // could be customized later per category
    sumCategoryScores += cs.score * weight;
    sumCategoryWeights += weight;
  }

  let readiness = sumCategoryWeights === 0 ? 0 : sumCategoryScores / sumCategoryWeights;
  const readinessPct = Math.round(readiness * 100);

  const blocked = activeCategories.some(cs => cs.hasGatingNoGo);

  let verdict: Verdict;
  if (blocked) {
    verdict = "NO_GO_BLOCKED_BY_GATING";
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

