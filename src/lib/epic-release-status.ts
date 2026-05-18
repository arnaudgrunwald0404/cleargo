/**
 * Epic release status is derived from dates (effective Cohort 1 = off_schedule_release_date ?? target_launch_date,
 * scheduled_ga_dev_date) and retro completion. Only "Cancelled" is stored as an override on the epic.
 * When scheduled_ga_dev_date is not set, GA date uses release-train Cohort 2 when available, else Cohort 1 + 28 days.
 */

import { getEffectiveCohort1DateYmd } from '@/lib/epic-cohort1-date';
import {
  GA_DAYS_AFTER_LAUNCH,
  resolveEpicGaDateYmd,
  type ReleaseScheduleDateRow,
} from '@/lib/epic-ga-date';
import type { Epic } from '@/types/epics';

export { GA_DAYS_AFTER_LAUNCH };
export type { ReleaseScheduleDateRow };

export type EpicReleaseStatus =
  | 'Pre_Release'
  | 'Released_Cohort_1'
  | 'Released_GA'
  | 'Released_Retroed'
  | 'Cancelled';

const RELEASED_STATUSES: EpicReleaseStatus[] = [
  'Released_Cohort_1',
  'Released_GA',
  'Released_Retroed',
];

export function isReleasedStatus(status: string): boolean {
  return RELEASED_STATUSES.includes(status as EpicReleaseStatus);
}

export interface EpicForStatus {
  id: string;
  status?: string | null;
  target_launch_date?: string | null;
  scheduled_ga_dev_date?: string | null;
  aha_fields?: Record<string, any> | null;
}

export interface RetroForStatus {
  day_marker: number;
  status: string;
}

const REQUIRED_DAY_MARKERS = [30, 60, 90];

function allRetrosSubmitted(retros: RetroForStatus[]): boolean {
  const submitted = new Set(
    retros.filter((r) => r.status === 'SUBMITTED').map((r) => r.day_marker)
  );
  return REQUIRED_DAY_MARKERS.every((d) => submitted.has(d));
}

/**
 * Compute epic release status from dates and retro completion.
 * Stored epic.status is only used as override for Cancelled.
 * GA date: from scheduled_ga_dev_date when set, else release-train Cohort 2, else Cohort 1 + 28 days.
 */
export function computeEpicReleaseStatus(
  epic: EpicForStatus,
  retros: RetroForStatus[] = [],
  options?: { releaseSchedule?: ReleaseScheduleDateRow[] }
): EpicReleaseStatus {
  if (epic.status === 'Cancelled') {
    return 'Cancelled';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cohortYmd = getEffectiveCohort1DateYmd(epic as Pick<Epic, 'target_launch_date' | 'aha_fields'>);
  const launchDate = cohortYmd ? new Date(cohortYmd + 'T12:00:00') : null;

  if (!launchDate || isNaN(launchDate.getTime())) {
    return 'Pre_Release';
  }

  launchDate.setHours(0, 0, 0, 0);

  if (today <= launchDate) {
    return 'Pre_Release';
  }

  const gaYmd = resolveEpicGaDateYmd(epic as Pick<Epic, 'scheduled_ga_dev_date' | 'target_launch_date' | 'aha_fields'>, {
    releaseSchedule: options?.releaseSchedule,
  });
  let gaDate: Date | null = gaYmd ? new Date(gaYmd + 'T12:00:00') : null;
  if (gaDate) gaDate.setHours(0, 0, 0, 0);
  if (!gaDate || isNaN(gaDate.getTime())) {
    gaDate = new Date(launchDate);
    gaDate.setDate(gaDate.getDate() + GA_DAYS_AFTER_LAUNCH);
  }

  if (today < gaDate) {
    return 'Released_Cohort_1';
  }

  const retrosComplete = allRetrosSubmitted(retros);
  return retrosComplete ? 'Released_Retroed' : 'Released_GA';
}
