import type { Epic } from '@/types/epics';
import { parseDateOnlyLocal, dateToLocalDateString, formatDateOnlyForDisplay } from '@/lib/date-utils';
import { isSingleGaRollout } from '@/lib/rollout-process-kind';

/**
 * Read the off-schedule release date from the aha_fields JSONB column.
 * This is the canonical accessor — do NOT read epic.off_schedule_release_date directly.
 */
export function getOffScheduleReleaseDate(epic: Pick<Epic, 'aha_fields'>): string | null {
  return (epic.aha_fields as any)?.custom_fields?.off_schedule_release_date ?? null;
}

/** Cohort 1 anchor for list views and notifications: off-schedule date wins over target launch. */
export function getEffectiveCohort1DateYmd(
  epic: Pick<Epic, 'target_launch_date' | 'aha_fields'>
): string | null {
  // Single GA: off-schedule is the GA date, not Cohort 1
  if (isSingleGaRollout(epic)) {
    const tl = parseDateOnlyLocal(epic.target_launch_date);
    return tl ? dateToLocalDateString(tl) : null;
  }
  const off = parseDateOnlyLocal(getOffScheduleReleaseDate(epic));
  if (off) return dateToLocalDateString(off);
  const tl = parseDateOnlyLocal(epic.target_launch_date);
  return tl ? dateToLocalDateString(tl) : null;
}

export function isCohort1FromOffSchedule(epic: Pick<Epic, 'aha_fields'>): boolean {
  return parseDateOnlyLocal(getOffScheduleReleaseDate(epic)) != null;
}

/**
 * Epic detail / timeline: off-schedule overrides release-schedule-derived date, then schedule date, then target launch.
 */
export function getEpicCohort1DisplayYmd(
  epic: Pick<Epic, 'target_launch_date' | 'aha_fields'>,
  releaseDateFromSchedule?: string | null
): string | null {
  if (isSingleGaRollout(epic)) return null;
  const off = parseDateOnlyLocal(getOffScheduleReleaseDate(epic));
  if (off) return dateToLocalDateString(off);
  const sched = releaseDateFromSchedule ? parseDateOnlyLocal(releaseDateFromSchedule) : null;
  if (sched) return dateToLocalDateString(sched);
  const tl = parseDateOnlyLocal(epic.target_launch_date);
  return tl ? dateToLocalDateString(tl) : null;
}

export function formatCohort1DateForSlack(
  epic: Pick<Epic, 'target_launch_date' | 'aha_fields'>
): string {
  const ymd = getEffectiveCohort1DateYmd(epic);
  if (!ymd) return '';
  const d = formatDateOnlyForDisplay(ymd);
  return isCohort1FromOffSchedule(epic) ? `${d} (off-schedule release date)` : d;
}
