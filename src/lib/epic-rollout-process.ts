import type { Epic } from '@/types/epics';
import { parseDateOnlyLocal, dateToLocalDateString } from '@/lib/date-utils';
import {
  getOffScheduleReleaseDate,
  getEpicCohort1DisplayYmd,
  isCohort1FromOffSchedule,
} from '@/lib/epic-cohort1-date';
import { resolveEpicGaDateYmd, type ReleaseScheduleDateRow } from '@/lib/epic-ga-date';
import { getEpicRolloutAnchorYmd } from '@/lib/epic-rollout-dates';

export type RolloutProcessKind = 'single_ga' | 'dual_cohort';

/** Normalize Aha picklist value to internal kind. Missing/unknown defaults to dual_cohort. */
export function parseRolloutProcess(raw: unknown): RolloutProcessKind {
  if (raw == null || raw === '') return 'dual_cohort';
  const s = String(raw).trim().toLowerCase();
  if (s.includes('single') && s.includes('ga')) return 'single_ga';
  if (s === 'single ga' || s === 'single_ga') return 'single_ga';
  if (s.includes('dual') && s.includes('cohort')) return 'dual_cohort';
  if (s === 'dual cohort' || s === 'dual_cohort') return 'dual_cohort';
  return 'dual_cohort';
}

export function getRolloutProcess(
  epic: Pick<Epic, 'aha_fields'>
): RolloutProcessKind {
  const raw = (epic.aha_fields as { custom_fields?: Record<string, unknown> } | null)?.custom_fields
    ?.rollout_process;
  return parseRolloutProcess(raw);
}

export function isSingleGaRollout(epic: Pick<Epic, 'aha_fields'>): boolean {
  return getRolloutProcess(epic) === 'single_ga';
}

export function isDualCohortRollout(epic: Pick<Epic, 'aha_fields'>): boolean {
  return !isSingleGaRollout(epic);
}

export function shouldShowCohort1Column(epic: Pick<Epic, 'aha_fields'>): boolean {
  return isDualCohortRollout(epic);
}

/** Cohort 1 anchor excluding off-schedule (for GA math on Single GA epics). */
export function getCohort1AnchorWithoutOffSchedule(
  epic: Pick<Epic, 'target_launch_date' | 'aha_fields'>,
  releaseTrainDateYmd?: string | null
): string | null {
  const tl = parseDateOnlyLocal(epic.target_launch_date);
  if (tl) return dateToLocalDateString(tl);
  if (releaseTrainDateYmd) {
    const d = parseDateOnlyLocal(releaseTrainDateYmd);
    if (d) return dateToLocalDateString(d);
  }
  return null;
}

/** Cohort 1 column date: empty for Single GA; off-schedule or planned for Dual Cohort. */
export function getRolloutAwareCohort1Ymd(
  epic: Pick<Epic, 'target_launch_date' | 'aha_fields'>,
  releaseDateFromSchedule?: string | null
): string | null {
  if (isSingleGaRollout(epic)) return null;
  return getEpicCohort1DisplayYmd(epic, releaseDateFromSchedule);
}

export function isRolloutCohort1FromOffSchedule(epic: Pick<Epic, 'aha_fields'>): boolean {
  if (isSingleGaRollout(epic)) return false;
  return isCohort1FromOffSchedule(epic);
}

export function isRolloutGaFromOffSchedule(epic: Pick<Epic, 'aha_fields'>): boolean {
  if (!isSingleGaRollout(epic)) return false;
  return parseDateOnlyLocal(getOffScheduleReleaseDate(epic)) != null;
}

/** GA column date with rollout-aware off-schedule routing. */
export function getRolloutAwareGaYmd(
  epic: Pick<Epic, 'scheduled_ga_dev_date' | 'target_launch_date' | 'aha_fields'>,
  options?: {
    releaseSchedule?: ReleaseScheduleDateRow[];
    releaseTrainDateYmd?: string | null;
  }
): string | null {
  if (isSingleGaRollout(epic)) {
    const off = parseDateOnlyLocal(getOffScheduleReleaseDate(epic));
    if (off) return dateToLocalDateString(off);
  }

  const cohort1Ymd = isSingleGaRollout(epic)
    ? getCohort1AnchorWithoutOffSchedule(epic, options?.releaseTrainDateYmd)
    : getEpicRolloutAnchorYmd(epic, options?.releaseTrainDateYmd);

  return resolveEpicGaDateYmd(epic, {
    releaseSchedule: options?.releaseSchedule,
    cohort1Ymd,
  });
}

export type ReleaseDateShading = 'none' | 'orange' | 'blue' | 'off-schedule';

export function getCohort1CellShading(
  epic: Pick<Epic, 'aha_fields'>,
  hasDate: boolean
): ReleaseDateShading {
  if (!hasDate || isSingleGaRollout(epic)) return 'none';
  if (isCohort1FromOffSchedule(epic)) return 'off-schedule';
  return 'orange';
}

export function getGaCellShading(
  epic: Pick<Epic, 'aha_fields'>,
  hasDate: boolean
): ReleaseDateShading {
  if (!hasDate) return 'none';
  if (isRolloutGaFromOffSchedule(epic)) return 'off-schedule';
  return 'blue';
}
