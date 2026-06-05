import type { Epic } from '@/types/epics';
import { parseDateOnlyLocal, dateToLocalDateString } from '@/lib/date-utils';
import {
  getOffScheduleReleaseDate,
  getEffectiveCohort1DateYmd,
  getEpicCohort1DisplayYmd,
  isCohort1FromOffSchedule,
} from '@/lib/epic-cohort1-date';
import { resolveEpicGaDateYmd, type ReleaseScheduleDateRow } from '@/lib/epic-ga-date';
import { getEpicRolloutAnchorYmd } from '@/lib/epic-rollout-dates';
import {
  type RolloutProcessKind,
  parseRolloutProcess,
  getRolloutProcess,
  isSingleGaRollout,
  normalizeRolloutProcessRaw,
} from '@/lib/rollout-process-kind';

export type { RolloutProcessKind };
export { parseRolloutProcess, getRolloutProcess, isSingleGaRollout, normalizeRolloutProcessRaw };

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

/**
 * - off-schedule: yellow pill (Aha Off Schedule Release Date)
 * - alternate: bold italic when epic date differs from train but is not off-schedule
 */
export type ReleaseDateShading = 'none' | 'off-schedule' | 'alternate';

export function getCohort1CellShading(
  epic: Pick<Epic, 'target_launch_date' | 'aha_fields'>,
  hasDate: boolean,
  releaseTrainCohort1Ymd?: string | null
): ReleaseDateShading {
  if (!hasDate || isSingleGaRollout(epic)) return 'none';
  if (isCohort1FromOffSchedule(epic)) return 'off-schedule';
  const epicYmd = getEffectiveCohort1DateYmd(epic);
  if (
    releaseTrainCohort1Ymd &&
    epicYmd &&
    epicYmd !== releaseTrainCohort1Ymd
  ) {
    return 'alternate';
  }
  return 'none';
}

export function getGaCellShading(
  epic: Pick<Epic, 'aha_fields'>,
  hasDate: boolean,
  epicGaYmd?: string | null,
  releaseTrainGaYmd?: string | null
): ReleaseDateShading {
  if (!hasDate) return 'none';
  if (isRolloutGaFromOffSchedule(epic)) return 'off-schedule';
  if (epicGaYmd && releaseTrainGaYmd && epicGaYmd !== releaseTrainGaYmd) {
    return 'alternate';
  }
  return 'none';
}
