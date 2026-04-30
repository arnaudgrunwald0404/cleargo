/**
 * Roadmap confidence rating — ported from RRV `src/lib/confidenceCalculator.ts`.
 * Pure calculation; no DB or UI dependencies. Used by the confidence-rating job
 * and the read-only Confidence tab on the epic detail page.
 *
 * Bump CONFIDENCE_FORMULA_VERSION whenever the calculation changes so cached
 * confidence_rating rows can be detected as stale and recalculated.
 */

export type ConfidenceLevel = "very_low" | "low" | "medium" | "high" | "very_high";

export const CONFIDENCE_FORMULA_VERSION = 3;

export interface ConfidenceCalculation {
  calculated_percentage: number;
  calculated_confidence: ConfidenceLevel;
  final_percentage: number;
  final_confidence: ConfidenceLevel;
  breakdown: {
    base: number;
    progress_factor: number;
    progress_vs_time_factor: number;
    proximity_factor: number;
    schedule_stability_factor: number;
  };
}

/** Fields the calculator reads from a roadmap-snapshot or epic-shaped object. */
export interface ConfidenceInputItem {
  aha_key?: string | null;
  aha_status?: string | null;
  aha_t_shirt_est?: string | null;
  aha_release_date?: string | null;
  aha_progress?: number | null;
}

export function percentageToLevel(percentage: number): ConfidenceLevel {
  if (percentage <= 25) return "very_low";
  if (percentage <= 45) return "low";
  if (percentage <= 65) return "medium";
  if (percentage <= 85) return "high";
  return "very_high";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const TSHIRT_TO_IDEAL_DAYS: Record<string, number> = {
  XS: 14,
  S: 30,
  M: 60,
  L: 90,
  XL: 120,
  XXL: 180,
};

function tshirtToIdealDays(tshirt: string | null | undefined): number {
  if (!tshirt) return 60;
  const normalized = tshirt.toUpperCase().trim();
  return TSHIRT_TO_IDEAL_DAYS[normalized] ?? 60;
}

function daysUntilRelease(
  releaseDate: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!releaseDate) return null;
  const release = new Date(releaseDate);
  if (Number.isNaN(release.getTime())) return null;
  const diffMs = release.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function calculateProgressFactor(
  progress: number | null,
  status: string | null | undefined,
  daysRemaining: number | null,
  tshirt: string | null | undefined
): number {
  if (progress !== null && progress !== undefined) {
    if (progress >= 81) return 20;
    if (progress >= 61) return 10;
    if (progress >= 41) return 0;
    if (progress >= 21) return -5;

    if (daysRemaining !== null && tshirt) {
      const idealDays = tshirtToIdealDays(tshirt);
      const ratio = daysRemaining / idealDays;
      if (ratio >= 1.0) return -5;
      if (ratio >= 0.5) return -10;
      if (ratio >= 0.25) return -15;
      return -20;
    }
    return -10;
  }

  if (!status) {
    if (daysRemaining !== null && tshirt) {
      const idealDays = tshirtToIdealDays(tshirt);
      if (daysRemaining >= idealDays) return -5;
      return -10;
    }
    return -10;
  }

  const s = status.toLowerCase();
  if (s.includes("feature complete")) return 20;
  if (s.includes("complete") || s.includes("released") || s.includes("done")) return 20;
  if (s.includes("testing") || s.includes("qa")) return 15;
  if (s.includes("in progress") || s.includes("development")) return 0;

  if (daysRemaining !== null && tshirt) {
    const idealDays = tshirtToIdealDays(tshirt);
    if (daysRemaining >= idealDays) return -5;
    if (daysRemaining >= idealDays * 0.5) return -10;
    return -15;
  }
  return -10;
}

function calculateProgressVsTimeFactor(
  progress: number | null,
  tshirt: string | null | undefined,
  daysRemaining: number | null,
  status: string | null | undefined
): number {
  const s = (status || "").toLowerCase();
  if (s.includes("feature complete")) return 15;
  if (s.includes("complete") || s.includes("released") || s.includes("done")) return 15;

  if (progress === null || progress === undefined || daysRemaining === null) {
    if (daysRemaining === null) return 0;
    const idealDays = tshirtToIdealDays(tshirt);
    if (daysRemaining >= idealDays) return 10;
    if (daysRemaining >= idealDays * 0.5) return 0;
    if (daysRemaining >= idealDays * 0.25) return -10;
    return -15;
  }

  const idealDays = tshirtToIdealDays(tshirt);
  const daysElapsed = Math.max(0, idealDays - daysRemaining);
  const expectedProgress = (daysElapsed / idealDays) * 100;
  const diff = progress - expectedProgress;

  if (diff > 20) return 15;
  if (diff >= -20) return 5;
  if (diff >= -40) return -5;
  return -15;
}

function calculateProximityFactor(
  daysRemaining: number | null,
  progress: number | null,
  status: string | null | undefined
): number {
  if (daysRemaining === null) return 0;

  const s = (status || "").toLowerCase();
  if (s.includes("complete") || s.includes("released") || s.includes("done")) {
    if (daysRemaining < 30) return 10;
    return 5;
  }

  if (progress !== null && progress > 80 && daysRemaining < 14) return 5;

  if (daysRemaining > 90) return 5;
  if (daysRemaining > 30) return 0;
  if (daysRemaining > 14) return -5;
  return -10;
}

function calculateScheduleStabilityFactor(releaseChanges?: number): number {
  if (releaseChanges === undefined) return 0;
  if (releaseChanges === 0) return 5;
  if (releaseChanges <= 2) return 0;
  return -5;
}

/**
 * Calculate confidence rating for a roadmap item.
 *
 * @param item - Snapshot/epic-shaped object (only the four fields above are read).
 * @param pmAdjustment - PM offset, clamped to [-20, 20]. Persisted on confidence_rating.
 * @param releaseChanges - Optional count of release changes in the last 90 days.
 * @param now - Optional reference date (testing).
 */
export function calculateConfidence(
  item: ConfidenceInputItem,
  pmAdjustment: number = 0,
  releaseChanges?: number,
  now: Date = new Date()
): ConfidenceCalculation {
  const base = 50;
  const progress = item.aha_progress ?? null;
  const daysRemaining = daysUntilRelease(item.aha_release_date, now);

  const progressFactor = calculateProgressFactor(
    progress,
    item.aha_status,
    daysRemaining,
    item.aha_t_shirt_est
  );
  const progressVsTimeFactor = calculateProgressVsTimeFactor(
    progress,
    item.aha_t_shirt_est,
    daysRemaining,
    item.aha_status
  );
  const proximityFactor = calculateProximityFactor(daysRemaining, progress, item.aha_status);
  const scheduleStabilityFactor = calculateScheduleStabilityFactor(releaseChanges);

  const calculated_percentage = clamp(
    base + progressFactor + progressVsTimeFactor + proximityFactor + scheduleStabilityFactor,
    0,
    100
  );
  const calculated_confidence = percentageToLevel(calculated_percentage);

  const safeAdjustment = clamp(pmAdjustment, -20, 20);
  const final_percentage = clamp(calculated_percentage + safeAdjustment, 0, 100);
  const final_confidence = percentageToLevel(final_percentage);

  return {
    calculated_percentage: Math.round(calculated_percentage),
    calculated_confidence,
    final_percentage: Math.round(final_percentage),
    final_confidence,
    breakdown: {
      base,
      progress_factor: progressFactor,
      progress_vs_time_factor: progressVsTimeFactor,
      proximity_factor: proximityFactor,
      schedule_stability_factor: scheduleStabilityFactor,
    },
  };
}
