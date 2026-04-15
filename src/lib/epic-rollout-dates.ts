import type { Epic } from '@/types/epics';
import {
  parseDateOnlyLocal,
  dateToLocalDateString,
  addCalendarDays,
  subtractCalendarDays,
  addCalendarDaysToYmd,
} from '@/lib/date-utils';
import { isUiFrameworkEpic, parseUiLevelFromEpic } from '@/lib/epic-ui-framework';
import { GA_DAYS_AFTER_LAUNCH } from '@/lib/epic-release-status';
import { getEffectiveCohort1DateYmd } from '@/lib/epic-cohort1-date';

export type EpicRolloutStageRow = {
  id: number;
  name: string;
  sort_order: number;
  duration_days: number | null;
  level_durations?: Record<string, { min_days: number; max_days: number }> | null;
};

function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

function subtractBusinessDays(end: Date, days: number): Date {
  const d = new Date(end);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

function getEffectiveDuration(stage: EpicRolloutStageRow, uiLevel: number | null | undefined): number | null {
  if (uiLevel != null && stage.level_durations && typeof stage.level_durations === 'object') {
    const ld = stage.level_durations[String(uiLevel)];
    if (ld && typeof ld.min_days === 'number') {
      return ld.min_days;
    }
  }
  return stage.duration_days;
}

/** Optional explicit date from Aha (Phase 4b internal readiness). */
function parseAhaCustomDate(epic: Epic): string | null {
  const raw = epic.aha_fields?.custom_fields?.phase_4b_internal_readiness_distributed;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    const ymd = parseDateOnlyLocal(raw.trim());
    if (ymd) return dateToLocalDateString(ymd);
  }
  return null;
}

function findCohort1Stage(sorted: EpicRolloutStageRow[]): EpicRolloutStageRow | undefined {
  return sorted.find((s) => s.name.toLowerCase().includes('cohort 1'));
}

function findInternalStageBeforeCohort1(
  sorted: EpicRolloutStageRow[],
  cohort1: EpicRolloutStageRow
): EpicRolloutStageRow | undefined {
  return sorted.find(
    (s) => s.sort_order < cohort1.sort_order && s.name.toLowerCase().includes('internal')
  );
}

/** Start of Internal Readiness (calendar walk) — legacy release schedule. */
function internalOrgsDateTraditional(anchor: string, sorted: EpicRolloutStageRow[]): string | null {
  const cohort1Stage = findCohort1Stage(sorted);
  if (!cohort1Stage) return null;
  const internalStage = findInternalStageBeforeCohort1(sorted, cohort1Stage);
  if (!internalStage) return null;

  const preLaunchDays = sorted
    .filter((s) => s.sort_order < cohort1Stage.sort_order && s.duration_days != null)
    .reduce((sum, s) => sum + (s.duration_days ?? 0), 0);

  const anchorDate = parseDateOnlyLocal(anchor);
  if (!anchorDate) return null;

  const startDate = preLaunchDays > 0 ? subtractCalendarDays(anchorDate, preLaunchDays) : new Date(anchorDate);
  let cursor = new Date(startDate);
  for (const stage of sorted) {
    if (stage.sort_order >= internalStage.sort_order) break;
    const dur = stage.duration_days ?? 0;
    if (dur > 0) cursor = addCalendarDays(cursor, dur);
  }
  return dateToLocalDateString(cursor);
}

/**
 * Matches ReleaseStagesChart raw walk: cohort1 node's date before pinning to anchor.
 */
function internalOrgsDateUiRollout(anchor: string, sortedInput: EpicRolloutStageRow[], uiLevel: number): string | null {
  const sortedStages = [...sortedInput].sort((a, b) => a.sort_order - b.sort_order);
  const anchorDate = parseDateOnlyLocal(anchor);
  if (!anchorDate) return null;

  const totalPreLaunchBusinessDays = sortedStages
    .filter((s) => s.sort_order < (sortedStages[sortedStages.length - 1]?.sort_order ?? 0))
    .reduce((sum, s) => sum + (getEffectiveDuration(s, uiLevel) ?? 0), 0);

  const startDate = anchorDate
    ? subtractBusinessDays(anchorDate, totalPreLaunchBusinessDays)
    : new Date();

  let cursor = new Date(startDate);
  for (const stage of sortedStages) {
    const dur = getEffectiveDuration(stage, uiLevel) ?? 0;
    const nodeStart = new Date(cursor);
    const isCohort1 = stage.name.toLowerCase().includes('cohort 1') && !stage.name.toLowerCase().includes('cohort 2');
    if (isCohort1) {
      return dateToLocalDateString(nodeStart);
    }
    cursor = dur > 0 ? addBusinessDays(cursor, dur) : new Date(cursor);
  }
  return null;
}

/**
 * First day of Internal Readiness for legacy schedule; for UI Framework, boundary date before Cohort 1 go-live (matches timeline).
 */
export function getEpicInternalOrgsDateYmd(
  epic: Epic,
  releaseScheduleStages: EpicRolloutStageRow[] | undefined,
  uiRolloutStages: EpicRolloutStageRow[] | undefined
): string | null {
  const explicit = parseAhaCustomDate(epic);
  if (explicit) return explicit;

  const anchor = epic.target_launch_date;
  if (!anchor) return null;

  const uiLevel = parseUiLevelFromEpic(epic);
  const useUi = isUiFrameworkEpic(epic) && uiRolloutStages && uiRolloutStages.length > 0 && uiLevel != null;

  if (useUi && uiLevel != null) {
    return internalOrgsDateUiRollout(anchor, uiRolloutStages, uiLevel);
  }

  if (releaseScheduleStages?.length) {
    const sorted = [...releaseScheduleStages].sort((a, b) => a.sort_order - b.sort_order);
    return internalOrgsDateTraditional(anchor, sorted);
  }

  return null;
}

/** Cohort 1 go-live — off-schedule release date overrides target launch when set. */
export function getEpicCohort1DateYmd(epic: Pick<Epic, 'target_launch_date' | 'off_schedule_release_date'>): string | null {
  return getEffectiveCohort1DateYmd(epic);
}

/** GA date: scheduled GA from Aha, else effective Cohort 1 + 28 calendar days. */
export function getEpicGaDateYmd(
  epic: Pick<Epic, 'scheduled_ga_dev_date' | 'target_launch_date' | 'off_schedule_release_date'>
): string | null {
  const scheduled = parseDateOnlyLocal(epic.scheduled_ga_dev_date);
  if (scheduled) return dateToLocalDateString(scheduled);
  const cohort = getEffectiveCohort1DateYmd(epic);
  if (!cohort) return null;
  return addCalendarDaysToYmd(cohort, GA_DAYS_AFTER_LAUNCH);
}
