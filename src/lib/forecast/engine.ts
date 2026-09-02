/**
 * Deterministic forecast calculation engine — ramp × price × volume, month by month, rolled
 * up to quarterly and annual. Pure functions, no I/O, no LLM calls.
 *
 * This is the engine the live generation pipeline (Phase 5, src/lib/forecast/orchestrator.ts)
 * uses to build a NEW forecast from scratch, where the model shape is uniform by design —
 * unlike the 11 migrated historical forecasts (each a bespoke hand-built model; see the Phase 3
 * commit message for why those are edited directly rather than recomputed through one formula).
 *
 * Mirrors the Volume Agent design in the original Chrysalis-repo FORECASTING-SKILL.md (Step 4):
 * new accounts ramp in monthly against an eligible pool, priced at ACV, split cross-sell vs.
 * net-new; churn reduction is modeled separately against a named at-risk ARR pool, never summed
 * into bookings.
 */

export type Scenario = 'bear' | 'base' | 'bull';
export type PeriodType = 'month' | 'quarter' | 'year';

export interface ScenarioValue<T> {
  bear: T;
  base: T;
  bull: T;
}

export interface RampProfile {
  /** Human-readable name, e.g. "AI Notetaker baseline: 12-month elongated S-curve". Stored on the assumption row as provenance. */
  name: string;
  /**
   * Cumulative fraction of full run-rate reached by end of each month after GA (month 1 = first
   * month of revenue). Must be non-decreasing and reach 1.0 by the end. Index 0 = month 1.
   */
  cumulativeFractionByMonth: number[];
}

/** A conservative default: ~12-month elongated S-curve, matching AI Notetaker's empirical shape (slow start, steady mid-ramp, plateau near month 10-12). */
export const AI_NOTETAKER_BASELINE_RAMP: RampProfile = {
  name: 'AI Notetaker baseline: 12-month elongated S-curve',
  cumulativeFractionByMonth: [0.05, 0.1, 0.18, 0.28, 0.4, 0.53, 0.65, 0.76, 0.85, 0.92, 0.97, 1.0],
};

export interface VolumeEngineInput {
  /** GA date — month 0. Revenue starts month 1. */
  gaDate: Date;
  /** Total months to model, typically 36 (or through the end of the 3rd calendar year, whichever is later). */
  horizonMonths: number;
  /** Size of the eligible cross-sell/adoption pool. */
  eligiblePool: ScenarioValue<number>;
  /** 3-year penetration rate of the eligible pool (0-1). Applied against eligiblePool, ramped in via rampProfile. */
  threeYearPenetration: ScenarioValue<number>;
  /** Annual contract value per adopting account. */
  acv: ScenarioValue<number>;
  /** Fraction of newly-adopting accounts attributed to cross-sell (existing base) vs. net-new logos (0-1). */
  crossSellShare: ScenarioValue<number>;
  rampProfile: ScenarioValue<RampProfile>;
  /** Named at-risk ARR pool for the churn-reduction track — independent of the bookings model above. */
  churnAtRiskArrUsd: ScenarioValue<number>;
  /** Fraction of the at-risk pool retained (protected) by the end of the horizon, ramping in linearly from GA. */
  churnProtectionRate: ScenarioValue<number>;
}

export interface PeriodRow {
  scenario: Scenario;
  period_type: PeriodType;
  period_label: string;
  period_start: string; // ISO date, first day of the period
  cross_sell_arr_usd: number;
  net_new_arr_usd: number;
  churn_reduction_arr_usd: number;
  total_arr_usd: number;
  sort_order: number;
}

const SCENARIOS: Scenario[] = ['bear', 'base', 'bull'];

function monthlyBookingsForScenario(input: VolumeEngineInput, scenario: Scenario): { crossSell: number; netNew: number }[] {
  const pool = input.eligiblePool[scenario];
  const penetration = input.threeYearPenetration[scenario];
  const acv = input.acv[scenario];
  const crossSellShare = input.crossSellShare[scenario];
  const ramp = input.rampProfile[scenario].cumulativeFractionByMonth;
  const targetAdoptingAccounts = pool * penetration;

  const rows: { crossSell: number; netNew: number }[] = [];
  let cumulativeAccountsPrev = 0;
  for (let m = 1; m <= input.horizonMonths; m++) {
    // Ramp profile is defined out to its own length; hold at 1.0 (full target) beyond that.
    const rampIndex = Math.min(m, ramp.length) - 1;
    const cumulativeFraction = rampIndex >= 0 ? ramp[rampIndex] : 0;
    const cumulativeAccounts = targetAdoptingAccounts * cumulativeFraction;
    const newAccountsThisMonth = Math.max(0, cumulativeAccounts - cumulativeAccountsPrev);
    cumulativeAccountsPrev = cumulativeAccounts;

    // Monthly ARR contribution = cumulative in-ARR accounts x (ACV / 12) — accounts already
    // adopted in prior months keep contributing; this month's new accounts add proportionally.
    const monthlyRevenue = (cumulativeAccounts * acv) / 12;
    rows.push({
      crossSell: monthlyRevenue * crossSellShare,
      netNew: monthlyRevenue * (1 - crossSellShare),
    });
    void newAccountsThisMonth; // retained for future per-month account-count reporting
  }
  return rows;
}

function monthlyChurnReductionForScenario(input: VolumeEngineInput, scenario: Scenario): number[] {
  const atRisk = input.churnAtRiskArrUsd[scenario];
  const targetProtection = input.churnProtectionRate[scenario];
  const rows: number[] = [];
  for (let m = 1; m <= input.horizonMonths; m++) {
    // Linear ramp of protection from 0 at GA to targetProtection by the end of the horizon.
    const rampFraction = Math.min(1, m / input.horizonMonths);
    const protectedArr = atRisk * targetProtection * rampFraction;
    // Monthly contribution is the run-rate divided by 12 (protected ARR is a run-rate figure, not cumulative bookings).
    rows.push(protectedArr / 12);
  }
  return rows;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function quarterLabel(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `Q${q} ${date.getFullYear()}`;
}

/** Runs the full model and returns period rows at month, quarter, and year granularity for all three scenarios. */
export function computeForecastPeriods(input: VolumeEngineInput): PeriodRow[] {
  const out: PeriodRow[] = [];
  let sortOrder = 0;

  for (const scenario of SCENARIOS) {
    const monthlyBookings = monthlyBookingsForScenario(input, scenario);
    const monthlyChurn = monthlyChurnReductionForScenario(input, scenario);

    // Month rows
    for (let i = 0; i < input.horizonMonths; i++) {
      const periodStart = addMonths(input.gaDate, i);
      const crossSell = monthlyBookings[i].crossSell;
      const netNew = monthlyBookings[i].netNew;
      out.push({
        scenario,
        period_type: 'month',
        period_label: periodStart.toISOString().slice(0, 7),
        period_start: periodStart.toISOString().slice(0, 10),
        cross_sell_arr_usd: Math.round(crossSell),
        net_new_arr_usd: Math.round(netNew),
        churn_reduction_arr_usd: Math.round(monthlyChurn[i]),
        total_arr_usd: Math.round(crossSell + netNew),
        sort_order: sortOrder++,
      });
    }

    // Quarter rollup
    const quarterMap = new Map<string, { start: Date; crossSell: number; netNew: number; churn: number }>();
    for (let i = 0; i < input.horizonMonths; i++) {
      const periodStart = addMonths(input.gaDate, i);
      const label = quarterLabel(periodStart);
      const existing = quarterMap.get(label);
      const crossSell = monthlyBookings[i].crossSell;
      const netNew = monthlyBookings[i].netNew;
      const churn = monthlyChurn[i];
      if (existing) {
        existing.crossSell += crossSell;
        existing.netNew += netNew;
        existing.churn += churn;
      } else {
        quarterMap.set(label, { start: periodStart, crossSell, netNew, churn });
      }
    }
    for (const [label, q] of quarterMap) {
      out.push({
        scenario,
        period_type: 'quarter',
        period_label: label,
        period_start: q.start.toISOString().slice(0, 10),
        cross_sell_arr_usd: Math.round(q.crossSell),
        net_new_arr_usd: Math.round(q.netNew),
        churn_reduction_arr_usd: Math.round(q.churn),
        total_arr_usd: Math.round(q.crossSell + q.netNew),
        sort_order: sortOrder++,
      });
    }

    // Year rollup
    const yearMap = new Map<number, { crossSell: number; netNew: number; churn: number }>();
    for (let i = 0; i < input.horizonMonths; i++) {
      const periodStart = addMonths(input.gaDate, i);
      const year = periodStart.getFullYear();
      const existing = yearMap.get(year);
      const crossSell = monthlyBookings[i].crossSell;
      const netNew = monthlyBookings[i].netNew;
      const churn = monthlyChurn[i];
      if (existing) {
        existing.crossSell += crossSell;
        existing.netNew += netNew;
        existing.churn += churn;
      } else {
        yearMap.set(year, { crossSell, netNew, churn });
      }
    }
    for (const [year, y] of yearMap) {
      out.push({
        scenario,
        period_type: 'year',
        period_label: String(year),
        period_start: `${year}-01-01`,
        cross_sell_arr_usd: Math.round(y.crossSell),
        net_new_arr_usd: Math.round(y.netNew),
        churn_reduction_arr_usd: Math.round(y.churn),
        total_arr_usd: Math.round(y.crossSell + y.netNew),
        sort_order: sortOrder++,
      });
    }
  }

  return out;
}
