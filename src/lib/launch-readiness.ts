import type { TaskStatus } from '@/types/launches';
import {
  resolveOffsetDays,
  scheduleState,
  tMinusDueDate,
  type CriterionSchedule,
} from './launchCriteria';

/**
 * Percent of checklist items complete. Unweighted, and blind to gates and dates.
 * Retained because three API routes persist it into launch.readiness_pct;
 * computeLaunchReadiness below is the version worth showing a human.
 */
export function calculateLaunchReadiness(statuses: Array<{ status: TaskStatus }>): number {
  if (statuses.length === 0) return 0;
  const done = statuses.filter(s => s.status === 'DONE').length;
  return Math.round((done / statuses.length) * 100);
}

/**
 * Same vocabulary the epic readiness model uses (src/lib/readiness-scoring.ts)
 * so both detail pages speak one language. The scoring itself cannot be shared:
 * epic criteria are VOTED (GO / CONDITIONAL_GO / NO_GO per reviewer), while
 * launch criteria are COMPLETED (NOT_STARTED / IN_PROGRESS / DONE). Same words,
 * different arithmetic.
 */
export type LaunchVerdict =
  | 'GO'
  | 'CONDITIONAL_GO'
  | 'AT_RISK'
  | 'NO_GO_BLOCKED_BY_GATING'
  | 'NOT_EVALUATED';

/** Gates count for more than ordinary items, as in the epic model. */
const GATING_WEIGHT_MULTIPLIER = 3;

export interface LaunchReadinessItem extends CriterionSchedule {
  id: string;
  label: string;
  status: TaskStatus;
  due_date: string | null;
  /**
   * Truthy means gating. Accepts boolean or the legacy 'hard' string: the column
   * is boolean, but the admin UI still round-trips 'hard'/'soft' strings, so a
   * strict === comparison silently treats every gate as non-gating.
   */
  gate?: boolean | string | null;
}

export interface LaunchReadinessInput {
  items: LaunchReadinessItem[];
  targetLaunchDate: string | null;
  tier: string | null;
  launchCreatedAt?: string | null;
  /** Defaults to today; injectable to keep this pure and testable. */
  today?: string;
}

export interface LaunchReadinessResult {
  readinessPct: number;
  verdict: LaunchVerdict;
  /** Gates past their due date and not done — these are what block. */
  blockers: Array<{ id: string; label: string; due_date: string | null }>;
  /** Gates that should be in progress right now but are not done. */
  atRisk: Array<{ id: string; label: string; due_date: string | null }>;
  gatesTotal: number;
  gatesDone: number;
  itemsTotal: number;
  itemsDone: number;
}

export function isGating(gate: boolean | string | null | undefined): boolean {
  return gate === true || gate === 'hard';
}

/**
 * True when a row needs no further work.
 *
 * NOT_APPLICABLE counts as settled but is NOT the same as done: an inapplicable
 * row is excluded from the readiness denominator entirely rather than credited as
 * complete. Otherwise a launch that runs no beta would score higher than one that
 * ran a beta and passed it.
 */
export function isSettled(status: TaskStatus): boolean {
  return status === 'DONE' || status === 'NOT_APPLICABLE';
}

export function computeLaunchReadiness({
  items,
  targetLaunchDate,
  tier,
  launchCreatedAt,
  today,
}: LaunchReadinessInput): LaunchReadinessResult {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);

  // An inapplicable row is not part of the score at all, in either direction.
  const applicable = items.filter(i => i.status !== 'NOT_APPLICABLE');
  const gatesTotal = applicable.filter(i => isGating(i.gate)).length;
  const gatesDone = applicable.filter(i => isGating(i.gate) && i.status === 'DONE').length;
  const itemsDone = applicable.filter(i => i.status === 'DONE').length;

  const empty: LaunchReadinessResult = {
    readinessPct: 0,
    verdict: 'NOT_EVALUATED',
    blockers: [],
    atRisk: [],
    gatesTotal,
    gatesDone,
    itemsTotal: applicable.length,
    itemsDone,
  };
  if (applicable.length === 0) return empty;

  // Weighted completion: a gate is worth GATING_WEIGHT_MULTIPLIER ordinary items,
  // so clearing 3 gates moves the number more than ticking 3 release-note tasks.
  let weight = 0;
  let earned = 0;
  for (const i of applicable) {
    const w = isGating(i.gate) ? GATING_WEIGHT_MULTIPLIER : 1;
    weight += w;
    if (i.status === 'DONE') earned += w;
    else if (i.status === 'IN_PROGRESS') earned += w * 0.5;
  }
  const readinessPct = weight === 0 ? 0 : Math.round((earned / weight) * 100);

  if (!targetLaunchDate) {
    // Without an anchor there are no dates, so nothing can be late or at risk.
    return { ...empty, readinessPct, verdict: 'NOT_EVALUATED' };
  }

  const blockers: LaunchReadinessResult['blockers'] = [];
  const atRisk: LaunchReadinessResult['atRisk'] = [];
  let nonGateLate = false;

  for (const item of items) {
    if (isSettled(item.status)) continue;
    const startDate = tMinusDueDate(targetLaunchDate, resolveOffsetDays(item, tier));
    const state = scheduleState({
      startDate,
      dueDate: item.due_date,
      today: todayStr,
      launchCreatedAt: launchCreatedAt ?? null,
      targetLaunchDate,
    });

    if (!isGating(item.gate)) {
      if (state === 'late') nonGateLate = true;
      continue;
    }

    // A gate whose window has passed is a hard block. 'compressed' is not a
    // blocker: the window never existed, so the team cannot have missed it --
    // that is at-risk, not no-go. It stops being compressed once the fair window
    // from launch creation closes (see scheduleState), so a gate that is simply
    // never done still lands here as a blocker rather than sitting amber.
    if (state === 'late') {
      blockers.push({ id: item.id, label: item.label, due_date: item.due_date });
    } else if (state === 'in_window' || state === 'compressed') {
      atRisk.push({ id: item.id, label: item.label, due_date: item.due_date });
    }
  }

  let verdict: LaunchVerdict;
  if (blockers.length > 0) {
    verdict = 'NO_GO_BLOCKED_BY_GATING';
  } else if (atRisk.length > 0) {
    verdict = 'AT_RISK';
  } else if (nonGateLate) {
    verdict = 'CONDITIONAL_GO';
  } else {
    // Every gate is either done or not yet due, and nothing has slipped.
    verdict = 'GO';
  }

  return {
    readinessPct,
    verdict,
    blockers,
    atRisk,
    gatesTotal,
    gatesDone,
    itemsTotal: applicable.length,
    itemsDone,
  };
}

export const VERDICT_LABEL: Record<LaunchVerdict, string> = {
  GO: 'On track',
  CONDITIONAL_GO: 'Conditional',
  AT_RISK: 'At risk',
  NO_GO_BLOCKED_BY_GATING: 'Blocked by gate',
  NOT_EVALUATED: 'Not evaluated',
};

/** Tailwind classes, matching the traffic-light language used across the app. */
export const VERDICT_CLASS: Record<LaunchVerdict, string> = {
  GO: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  CONDITIONAL_GO: 'text-amber-700 bg-amber-50 border-amber-200',
  AT_RISK: 'text-amber-700 bg-amber-50 border-amber-200',
  NO_GO_BLOCKED_BY_GATING: 'text-red-700 bg-red-50 border-red-200',
  NOT_EVALUATED: 'text-gray-500 bg-gray-50 border-gray-200',
};
