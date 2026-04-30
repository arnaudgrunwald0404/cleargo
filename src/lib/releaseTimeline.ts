/**
 * Single source of truth for launch timeline segment starts and criterion “due on” dates
 * (end of the rated stage’s segment), aligned with ReleaseStagesChart / epic matrix.
 */

import {
  parseDateOnlyLocal,
  dateToLocalDateString,
  addCalendarDays,
  subtractCalendarDays,
  addBusinessDays,
  subtractBusinessDays,
  toDateOnlyString,
} from '@/lib/date-utils';

export interface ReleaseTimelineStage {
  id: number;
  name: string;
  sort_order: number;
  duration_days: number | null;
  level_durations?: Record<string, { min_days: number; max_days: number }> | null;
  scope?: string | null;
}

/** Effective segment length: level_durations[uiLevel].min_days when set, else duration_days. */
export function getEffectiveStageDuration(
  stage: {
    duration_days?: number | null;
    level_durations?: Record<string, { min_days: number; max_days: number }> | null;
  },
  uiLevel: number | null | undefined
): number | null {
  if (uiLevel != null && stage.level_durations && typeof stage.level_durations === 'object') {
    const d = stage.level_durations[String(uiLevel)];
    if (d && typeof d.min_days === 'number') {
      return d.min_days;
    }
  }
  return stage.duration_days ?? null;
}

export function getBufferDays(
  stage: ReleaseTimelineStage,
  uiLevel: number | null | undefined
): number {
  if (uiLevel != null && stage.level_durations && typeof stage.level_durations === 'object') {
    const d = stage.level_durations[String(uiLevel)];
    if (d && typeof d.min_days === 'number' && typeof d.max_days === 'number') {
      return Math.max(0, d.max_days - d.min_days);
    }
  }
  return 0;
}

export interface BuildTimelineStageStartsParams {
  useBusinessDayTimeline: boolean;
  uiLevel?: number | null;
  cohort2Date?: string | null;
}

export interface TimelineStageStartsResult {
  /** Segment start dates per stage (sorted order), after cohort2 + Cohort 1 anchor pins. */
  starts: { id: number; date: Date }[];
  /**
   * UI rollout only: second-to-last stage start before pinning Cohort 1 to the launch anchor
   * (for chart tooltips). Undefined for traditional timelines.
   */
  preAnchorPinSecondToLastStart?: Date | null;
}

/**
 * Build each stage’s segment start date (same rules as ReleaseStagesChart).
 */
export function buildTimelineStageStarts(
  sortedStages: ReleaseTimelineStage[],
  targetLaunchDateYmd: string,
  params: BuildTimelineStageStartsParams
): TimelineStageStartsResult {
  const anchorDate =
    parseDateOnlyLocal(targetLaunchDateYmd) ?? new Date(targetLaunchDateYmd);
  const cohort2Parsed = params.cohort2Date
    ? parseDateOnlyLocal(params.cohort2Date) ?? new Date(params.cohort2Date)
    : null;

  const sorted = [...sortedStages].sort((a, b) => a.sort_order - b.sort_order);
  const stageStarts: { id: number; date: Date }[] = [];

  if (params.useBusinessDayTimeline) {
    const lastSort = sorted[sorted.length - 1]?.sort_order ?? 0;
    const totalPreLaunchBizDays = sorted
      .filter((s) => s.sort_order < lastSort)
      .reduce((sum, s) => sum + (getEffectiveStageDuration(s, params.uiLevel) ?? 0), 0);

    const startDate = subtractBusinessDays(anchorDate, totalPreLaunchBizDays);
    let cursor = new Date(startDate);
    for (const stage of sorted) {
      const dur = getEffectiveStageDuration(stage, params.uiLevel) ?? 0;
      stageStarts.push({ id: stage.id, date: new Date(cursor) });
      cursor = dur > 0 ? addBusinessDays(cursor, dur) : new Date(cursor);
    }
  } else {
    const cohort1Stage = sorted.find(
      (s) => typeof s.name === 'string' && s.name.toLowerCase().includes('cohort 1')
    );
    const preLaunchDays = cohort1Stage
      ? sorted
          .filter((s) => s.sort_order < cohort1Stage.sort_order && s.duration_days != null)
          .reduce((sum, s) => sum + (s.duration_days ?? 0), 0)
      : 0;
    const startDate =
      preLaunchDays > 0 ? subtractCalendarDays(anchorDate, preLaunchDays) : anchorDate;

    let cursor = new Date(startDate);
    for (const stage of sorted) {
      const dur = stage.duration_days ?? 0;
      stageStarts.push({ id: stage.id, date: new Date(cursor) });
      cursor = dur > 0 ? addCalendarDays(cursor, dur) : new Date(cursor);
    }
  }

  let preAnchorPinSecondToLastStart: Date | null | undefined;
  if (params.useBusinessDayTimeline && stageStarts.length >= 2) {
    preAnchorPinSecondToLastStart = new Date(stageStarts[stageStarts.length - 2].date);
  }

  if (cohort2Parsed && stageStarts.length > 0) {
    stageStarts[stageStarts.length - 1].date = new Date(cohort2Parsed);
  }
  if (anchorDate && stageStarts.length >= 2) {
    stageStarts[stageStarts.length - 2].date = new Date(anchorDate);
  }

  return { starts: stageStarts, preAnchorPinSecondToLastStart };
}

function buildStageEndDatesFromStarts(
  stageStarts: { id: number; date: Date }[],
  anchorDate: Date,
  useBusinessDayTimeline: boolean,
  cohort2Date: string | null | undefined
): Map<number, string> {
  const cohort2Parsed = cohort2Date
    ? parseDateOnlyLocal(cohort2Date) ?? new Date(cohort2Date)
    : null;

  const map = new Map<number, string>();
  for (let i = 0; i < stageStarts.length; i++) {
    const endDate =
      i < stageStarts.length - 1
        ? stageStarts[i + 1].date
        : useBusinessDayTimeline && cohort2Parsed
          ? cohort2Parsed
          : anchorDate;
    map.set(stageStarts[i].id, dateToLocalDateString(endDate));
  }
  return map;
}

/**
 * Map launch stage id → criterion due date (YYYY-MM-DD), end of that stage’s segment on the timeline.
 */
export function computeStageEndDatesByStageId(
  stages: ReleaseTimelineStage[],
  targetLaunchDate: string | null | undefined,
  options: {
    useBusinessDayTimeline: boolean;
    uiLevel?: number | null;
    cohort2Date?: string | null;
  }
): Map<number, string> {
  const ymd = toDateOnlyString(targetLaunchDate ?? null);
  if (!ymd || stages.length === 0) {
    return new Map();
  }
  const anchorDate = parseDateOnlyLocal(ymd) ?? new Date(ymd);
  const { starts } = buildTimelineStageStarts(stages, ymd, {
    useBusinessDayTimeline: options.useBusinessDayTimeline,
    uiLevel: options.uiLevel,
    cohort2Date: options.cohort2Date ?? null,
  });
  return buildStageEndDatesFromStarts(
    starts,
    anchorDate,
    options.useBusinessDayTimeline,
    options.cohort2Date ?? null
  );
}

/** Parse UI level 1–3 from epic Aha custom field (same logic as epic DB helpers). */
export function parseUiLevelFromEpicAha(ahaFields: unknown): number | undefined {
  const aha = ahaFields as { custom_fields?: { uiux_impact?: { name?: string } | string } } | undefined;
  const uiuxImpact = aha?.custom_fields?.uiux_impact;
  const uiuxImpactStr =
    typeof uiuxImpact === 'object' && uiuxImpact && 'name' in uiuxImpact
      ? String((uiuxImpact as { name?: string }).name)
      : uiuxImpact != null
        ? String(uiuxImpact)
        : '';
  const levelMatch = uiuxImpactStr.match(/\b([123])\b/);
  return levelMatch ? parseInt(levelMatch[1], 10) : undefined;
}
