import type { Epic } from '@/types/epics';
import { parseDateOnlyLocal, dateToLocalDateString, formatDateOnlyForDisplay } from '@/lib/date-utils';

/** Cohort 1 anchor for list views and notifications: off-schedule date wins over target launch. */
export function getEffectiveCohort1DateYmd(
  epic: Pick<Epic, 'target_launch_date' | 'off_schedule_release_date'>
): string | null {
  const off = parseDateOnlyLocal(epic.off_schedule_release_date);
  if (off) return dateToLocalDateString(off);
  const tl = parseDateOnlyLocal(epic.target_launch_date);
  return tl ? dateToLocalDateString(tl) : null;
}

export function isCohort1FromOffSchedule(epic: Pick<Epic, 'off_schedule_release_date'>): boolean {
  return parseDateOnlyLocal(epic.off_schedule_release_date) != null;
}

/**
 * Epic detail / timeline: off-schedule overrides release-schedule-derived date, then schedule date, then target launch.
 */
export function getEpicCohort1DisplayYmd(
  epic: Pick<Epic, 'target_launch_date' | 'off_schedule_release_date'>,
  releaseDateFromSchedule?: string | null
): string | null {
  const off = parseDateOnlyLocal(epic.off_schedule_release_date);
  if (off) return dateToLocalDateString(off);
  const sched = releaseDateFromSchedule ? parseDateOnlyLocal(releaseDateFromSchedule) : null;
  if (sched) return dateToLocalDateString(sched);
  const tl = parseDateOnlyLocal(epic.target_launch_date);
  return tl ? dateToLocalDateString(tl) : null;
}

export function formatCohort1DateForSlack(
  epic: Pick<Epic, 'target_launch_date' | 'off_schedule_release_date'>
): string {
  const ymd = getEffectiveCohort1DateYmd(epic);
  if (!ymd) return '';
  const d = formatDateOnlyForDisplay(ymd);
  return isCohort1FromOffSchedule(epic) ? `${d} (scheduled release date)` : d;
}
