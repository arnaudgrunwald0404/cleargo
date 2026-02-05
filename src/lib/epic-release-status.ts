/**
 * Epic release status is derived from dates (target_launch_date, scheduled_ga_dev_date)
 * and retro completion. Only "Cancelled" is stored as an override on the epic.
 * When scheduled_ga_dev_date is not set, GA date is computed as release date + 28 days.
 */

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

/** GA is 28 days after release when not set explicitly in Aha. */
const GA_DAYS_AFTER_LAUNCH = 28;

export function isReleasedStatus(status: string): boolean {
  return RELEASED_STATUSES.includes(status as EpicReleaseStatus);
}

export interface EpicForStatus {
  id: string;
  status?: string | null;
  target_launch_date?: string | null;
  scheduled_ga_dev_date?: string | null;
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
 * GA date: from scheduled_ga_dev_date when set, else release date + 28 days.
 */
export function computeEpicReleaseStatus(
  epic: EpicForStatus,
  retros: RetroForStatus[] = []
): EpicReleaseStatus {
  if (epic.status === 'Cancelled') {
    return 'Cancelled';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const launchDate = epic.target_launch_date
    ? new Date(epic.target_launch_date)
    : null;

  if (!launchDate || isNaN(launchDate.getTime())) {
    return 'Pre_Release';
  }

  launchDate.setHours(0, 0, 0, 0);

  if (today < launchDate) {
    return 'Pre_Release';
  }

  let gaDate: Date | null = null;
  if (epic.scheduled_ga_dev_date) {
    gaDate = new Date(epic.scheduled_ga_dev_date);
    gaDate.setHours(0, 0, 0, 0);
  }
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
