import {
  calculateConfidence,
  percentageToLevel,
  CONFIDENCE_FORMULA_VERSION,
  type ConfidenceInputItem,
} from "../confidenceCalculator";

const REFERENCE_NOW = new Date("2026-04-01T12:00:00Z");

function daysFromRef(days: number): string {
  const d = new Date(REFERENCE_NOW.getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

describe("percentageToLevel", () => {
  it.each([
    [0, "very_low"],
    [25, "very_low"],
    [26, "low"],
    [45, "low"],
    [46, "medium"],
    [65, "medium"],
    [66, "high"],
    [85, "high"],
    [86, "very_high"],
    [100, "very_high"],
  ])("%i → %s", (pct, expected) => {
    expect(percentageToLevel(pct)).toBe(expected);
  });
});

describe("calculateConfidence", () => {
  it("returns formula version constant for cache invalidation", () => {
    expect(CONFIDENCE_FORMULA_VERSION).toBeGreaterThan(0);
  });

  it("scores a near-done item with imminent release as very_high", () => {
    const item: ConfidenceInputItem = {
      aha_key: "CC-EPIC-1",
      aha_status: "Feature Complete",
      aha_t_shirt_est: "M",
      aha_release_date: daysFromRef(7),
      aha_progress: 95,
    };
    const result = calculateConfidence(item, 0, 0, REFERENCE_NOW);
    expect(result.calculated_confidence).toBe("very_high");
    expect(result.final_confidence).toBe("very_high");
    expect(result.breakdown.progress_factor).toBe(20);
    expect(result.breakdown.progress_vs_time_factor).toBe(15);
  });

  it("scores a not-started item due in 5 days as low/very_low", () => {
    const item: ConfidenceInputItem = {
      aha_key: "CC-EPIC-2",
      aha_status: "Not Started",
      aha_t_shirt_est: "M",
      aha_release_date: daysFromRef(5),
      aha_progress: 0,
    };
    const result = calculateConfidence(item, 0, 0, REFERENCE_NOW);
    expect(["very_low", "low"]).toContain(result.calculated_confidence);
  });

  it("does not penalize 0% progress when there is plenty of runway", () => {
    const item: ConfidenceInputItem = {
      aha_key: "CC-EPIC-3",
      aha_status: "In Progress",
      aha_t_shirt_est: "M",
      aha_release_date: daysFromRef(120),
      aha_progress: 0,
    };
    const result = calculateConfidence(item, 0, 0, REFERENCE_NOW);
    expect(result.breakdown.progress_factor).toBe(-5);
    expect(["medium", "low"]).toContain(result.calculated_confidence);
  });

  it("clamps PM adjustment to [-20, 20]", () => {
    const item: ConfidenceInputItem = {
      aha_status: "In Progress",
      aha_t_shirt_est: "M",
      aha_release_date: daysFromRef(60),
      aha_progress: 50,
    };
    const r1 = calculateConfidence(item, 999, 0, REFERENCE_NOW);
    const r2 = calculateConfidence(item, 20, 0, REFERENCE_NOW);
    expect(r1.final_percentage).toBe(r2.final_percentage);
  });

  it("clamps final percentage to [0, 100]", () => {
    const item: ConfidenceInputItem = {
      aha_status: "Released",
      aha_t_shirt_est: "S",
      aha_release_date: daysFromRef(2),
      aha_progress: 100,
    };
    const result = calculateConfidence(item, 20, 0, REFERENCE_NOW);
    expect(result.final_percentage).toBeLessThanOrEqual(100);
    expect(result.final_percentage).toBeGreaterThanOrEqual(0);
  });

  it("treats missing release date as null daysRemaining without crashing", () => {
    const item: ConfidenceInputItem = {
      aha_status: "In Progress",
      aha_t_shirt_est: "M",
      aha_release_date: null,
      aha_progress: 30,
    };
    const result = calculateConfidence(item, 0, 0, REFERENCE_NOW);
    expect(result.breakdown.proximity_factor).toBe(0);
    expect(result.calculated_percentage).toBeGreaterThanOrEqual(0);
  });

  it("rewards stability when releaseChanges is 0", () => {
    const item: ConfidenceInputItem = {
      aha_status: "In Progress",
      aha_t_shirt_est: "M",
      aha_release_date: daysFromRef(45),
      aha_progress: 50,
    };
    const stable = calculateConfidence(item, 0, 0, REFERENCE_NOW);
    const unstable = calculateConfidence(item, 0, 5, REFERENCE_NOW);
    expect(stable.breakdown.schedule_stability_factor).toBe(5);
    expect(unstable.breakdown.schedule_stability_factor).toBe(-5);
    expect(stable.calculated_percentage).toBeGreaterThan(unstable.calculated_percentage);
  });

  it("returns rounded integer percentages", () => {
    const item: ConfidenceInputItem = {
      aha_status: "Testing",
      aha_t_shirt_est: "L",
      aha_release_date: daysFromRef(20),
      aha_progress: 70,
    };
    const result = calculateConfidence(item, 7, 0, REFERENCE_NOW);
    expect(Number.isInteger(result.calculated_percentage)).toBe(true);
    expect(Number.isInteger(result.final_percentage)).toBe(true);
  });
});
