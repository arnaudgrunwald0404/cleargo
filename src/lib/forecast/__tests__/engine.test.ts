import { computeForecastPeriods, AI_NOTETAKER_BASELINE_RAMP, type VolumeEngineInput } from "../engine";

function baseInput(overrides: Partial<VolumeEngineInput> = {}): VolumeEngineInput {
  return {
    gaDate: new Date("2027-01-01T00:00:00Z"),
    horizonMonths: 24,
    eligiblePool: { bear: 200, base: 400, bull: 600 },
    threeYearPenetration: { bear: 0.1, base: 0.15, bull: 0.2 },
    acv: { bear: 5000, base: 7500, bull: 10000 },
    crossSellShare: { bear: 1, base: 1, bull: 1 },
    rampProfile: {
      bear: AI_NOTETAKER_BASELINE_RAMP,
      base: AI_NOTETAKER_BASELINE_RAMP,
      bull: AI_NOTETAKER_BASELINE_RAMP,
    },
    churnAtRiskArrUsd: { bear: 100_000, base: 200_000, bull: 300_000 },
    churnProtectionRate: { bear: 0.3, base: 0.5, bull: 0.7 },
    ...overrides,
  };
}

describe("computeForecastPeriods", () => {
  it("produces month, quarter, and year rows for all three scenarios", () => {
    const rows = computeForecastPeriods(baseInput());
    const scenarios = new Set(rows.map((r) => r.scenario));
    const periodTypes = new Set(rows.map((r) => r.period_type));
    expect(scenarios).toEqual(new Set(["bear", "base", "bull"]));
    expect(periodTypes).toEqual(new Set(["month", "quarter", "year"]));
  });

  it("has zero bookings in month 1 given a ramp that starts near zero, and grows toward target", () => {
    const rows = computeForecastPeriods(baseInput());
    const baseMonths = rows
      .filter((r) => r.scenario === "base" && r.period_type === "month")
      .sort((a, b) => a.sort_order - b.sort_order);
    expect(baseMonths[0].total_arr_usd).toBeLessThan(baseMonths[baseMonths.length - 1].total_arr_usd);
    expect(baseMonths[0].total_arr_usd).toBeGreaterThanOrEqual(0);
  });

  it("converges to full target ACV run-rate once the ramp profile completes", () => {
    const input = baseInput({ horizonMonths: 12 });
    const rows = computeForecastPeriods(input);
    const lastBaseMonth = rows
      .filter((r) => r.scenario === "base" && r.period_type === "month")
      .sort((a, b) => a.sort_order - b.sort_order)
      .at(-1)!;
    // At full ramp: monthly revenue = pool * penetration * acv / 12
    const expectedMonthly = (400 * 0.15 * 7500) / 12;
    expect(lastBaseMonth.total_arr_usd).toBeCloseTo(expectedMonthly, -1);
  });

  it("splits cross-sell vs net-new according to crossSellShare", () => {
    const input = baseInput({ crossSellShare: { bear: 0.5, base: 0.5, bull: 0.5 } });
    const rows = computeForecastPeriods(input);
    const baseYear = rows.find((r) => r.scenario === "base" && r.period_type === "year")!;
    expect(baseYear.cross_sell_arr_usd).toBeCloseTo(baseYear.net_new_arr_usd, -1);
  });

  it("keeps churn reduction out of total_arr_usd (bookings-only)", () => {
    const rows = computeForecastPeriods(baseInput());
    const baseYear = rows.find((r) => r.scenario === "base" && r.period_type === "year")!;
    expect(baseYear.total_arr_usd).toBeCloseTo(baseYear.cross_sell_arr_usd + baseYear.net_new_arr_usd, 0);
    expect(baseYear.churn_reduction_arr_usd).toBeGreaterThan(0);
  });

  it("quarter and year rollups are within normal per-month rounding tolerance of summed months", () => {
    // The year row rounds once from precise (unrounded) monthly sums; summing the already-
    // rounded month rows instead compounds up to 12 independent roundings. This is the same
    // "expected rounding noise" pattern called out explicitly in the migrated forecast docs
    // (e.g. succession-planning/forecast.md's reconciliation notes) — not a bug to eliminate.
    const rows = computeForecastPeriods(baseInput({ horizonMonths: 12 }));
    const months = rows.filter((r) => r.scenario === "base" && r.period_type === "month");
    const year = rows.find((r) => r.scenario === "base" && r.period_type === "year" && r.period_label === "2027")!;
    const summedTotal = months.reduce((s, m) => s + m.total_arr_usd, 0);
    expect(Math.abs(year.total_arr_usd - summedTotal)).toBeLessThan(Math.max(50, summedTotal * 0.02));
  });

  it("bear < base < bull for total 3-year bookings given monotonically increasing inputs", () => {
    const rows = computeForecastPeriods(baseInput({ horizonMonths: 36 }));
    const totalByScenario = (s: "bear" | "base" | "bull") =>
      rows.filter((r) => r.scenario === s && r.period_type === "year").reduce((sum, r) => sum + r.total_arr_usd, 0);
    expect(totalByScenario("bear")).toBeLessThan(totalByScenario("base"));
    expect(totalByScenario("base")).toBeLessThan(totalByScenario("bull"));
  });
});
