import type { Epic } from '@/types/epics';
import {
  parseDateOnlyLocal,
  dateToLocalDateString,
  addCalendarDaysToYmd,
  getCohort2DateForTimeline,
} from '@/lib/date-utils';
import { getEffectiveCohort1DateYmd } from '@/lib/epic-cohort1-date';
import { getReleaseNameFromAhaFields } from '@/lib/criterion-due-date';

/** Default GA offset when no release train or Aha scheduled GA is available. */
export const GA_DAYS_AFTER_LAUNCH = 28;

export type ReleaseScheduleDateRow = {
  release_name: string;
  launch_date: string | null;
  cohort2_date?: string | null;
};

export type EpicForGaDate = Pick<Epic, 'scheduled_ga_dev_date' | 'target_launch_date' | 'aha_fields'>;

/**
 * Resolves epic GA (Cohort 2) date as YYYY-MM-DD.
 * Priority: Aha scheduled GA → release train cohort2 (DB or next release) → Cohort 1 + 28 days.
 */
export function resolveEpicGaDateYmd(
  epic: EpicForGaDate,
  options?: { releaseSchedule?: ReleaseScheduleDateRow[]; cohort1Ymd?: string | null }
): string | null {
  const scheduled = parseDateOnlyLocal(epic.scheduled_ga_dev_date);
  if (scheduled) return dateToLocalDateString(scheduled);

  const cohort1 = options?.cohort1Ymd ?? getEffectiveCohort1DateYmd(epic);
  if (!cohort1) return null;

  const releaseName = getReleaseNameFromAhaFields(epic.aha_fields);
  const schedule = options?.releaseSchedule;
  if (releaseName && schedule?.length) {
    const row = schedule.find((r) => r.release_name === releaseName);
    const anchor = row?.launch_date ?? cohort1;
    const trainGa = getCohort2DateForTimeline(releaseName, anchor, schedule);
    if (trainGa) return trainGa;
  }

  return addCalendarDaysToYmd(cohort1, GA_DAYS_AFTER_LAUNCH);
}
