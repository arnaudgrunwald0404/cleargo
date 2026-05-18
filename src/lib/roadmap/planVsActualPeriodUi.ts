import {
  endOfQuarter,
  format,
  isAfter,
  max,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  subMonths,
  subQuarters,
} from 'date-fns';
import type { PlanVsActualPeriodType } from '@/types/roadmap';

/** Earliest quarter available in Plan vs Actual (snapshot coverage is reliable from here). */
export const PLAN_VS_ACTUAL_EARLIEST_QUARTER_START = '2026-01-01';

/** Start of the previous calendar month (local). */
export function previousCalendarMonthStart(): Date {
  return startOfMonth(subMonths(new Date(), 1));
}

/** Default: quarter that contains the previous calendar month, not before {@link PLAN_VS_ACTUAL_EARLIEST_QUARTER_START}. */
export function defaultQuarterStartDate(): string {
  const q = startOfQuarter(previousCalendarMonthStart());
  const minQ = parseISO(PLAN_VS_ACTUAL_EARLIEST_QUARTER_START);
  return format(max([q, minQ]), 'yyyy-MM-dd');
}

/** Quarter selector value must be a quarter start on/after Q1 2026. */
export function clampQuarterStartToPlanVsActualMin(quarterStartIso: string): string {
  const raw = quarterStartIso.trim().slice(0, 10);
  const d = parseISO(raw.length === 7 ? `${raw}-01` : raw);
  if (Number.isNaN(d.getTime())) return PLAN_VS_ACTUAL_EARLIEST_QUARTER_START;
  const minQ = parseISO(PLAN_VS_ACTUAL_EARLIEST_QUARTER_START);
  return format(max([startOfQuarter(d), minQ]), 'yyyy-MM-dd');
}

/**
 * Clamps API `period_date` so report windows never start before Q1 2026.
 * Normalizes to first day of month (progress/monthly) or quarter start (baseline/quarterly).
 */
export function clampPlanVsActualPeriodDate(
  periodType: PlanVsActualPeriodType,
  periodDateIso: string,
): string {
  const min = parseISO(PLAN_VS_ACTUAL_EARLIEST_QUARTER_START);
  const raw = periodDateIso.trim();
  const d = parseISO(raw.length === 7 ? `${raw}-01` : raw.slice(0, 10));
  if (Number.isNaN(d.getTime())) return PLAN_VS_ACTUAL_EARLIEST_QUARTER_START;

  if (periodType === 'quarterly' || periodType === 'quarter_baseline') {
    return format(max([startOfQuarter(d), min]), 'yyyy-MM-dd');
  }
  return format(max([startOfMonth(d), min]), 'yyyy-MM-dd');
}

/**
 * Quarter progress selector: baseline, month 1 / 2 in-quarter, or full quarter results.
 */
export type QuarterProgressWindow =
  | 'quarter-plan'
  | 'quarter-progress-1'
  | 'quarter-progress-2'
  | 'quarter-results';

export type QuarterProgressWindowOption = {
  value: QuarterProgressWindow;
  label: string;
  disabled?: boolean;
};

export function planVsActualApiParams(
  quarterStartDate: string,
  window: QuarterProgressWindow,
): { periodType: PlanVsActualPeriodType; periodDate: string } {
  const q = clampQuarterStartToPlanVsActualMin(quarterStartDate);
  const months = monthsInQuarterOptions(q);
  switch (window) {
    case 'quarter-plan':
      return { periodType: 'quarter_baseline', periodDate: q };
    case 'quarter-progress-1':
      return { periodType: 'quarter_progress', periodDate: months[0].value };
    case 'quarter-progress-2':
      return { periodType: 'quarter_progress', periodDate: months[1].value };
    case 'quarter-results':
      return { periodType: 'quarterly', periodDate: q };
  }
}

/**
 * Default window: prior month’s in-quarter progress if it falls in `quarterStartDate`’s quarter;
 * otherwise first progress month of that quarter.
 */
export function defaultQuarterProgressWindowForQuarter(quarterStartDate: string): QuarterProgressWindow {
  const prevStr = format(previousCalendarMonthStart(), 'yyyy-MM-dd');
  if (isMonthInQuarter(prevStr, quarterStartDate)) {
    const months = monthsInQuarterOptions(quarterStartDate);
    const ix = months.findIndex((m) => m.value === prevStr);
    if (ix === 0) return 'quarter-progress-1';
    if (ix === 1) return 'quarter-progress-2';
    if (ix === 2 && isQuarterResultsWindowAvailable(quarterStartDate)) {
      return 'quarter-results';
    }
  }
  return 'quarter-progress-1';
}

export function isMonthInQuarter(monthStartIso: string, quarterStartIso: string): boolean {
  const m = parseISO(monthStartIso);
  const qs = parseISO(quarterStartIso);
  const qe = endOfQuarter(qs);
  return m >= qs && m <= qe;
}

export function quarterSelectOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = subQuarters(startOfQuarter(now), i);
    const y = d.getFullYear();
    const q = Math.floor(d.getMonth() / 3) + 1;
    out.push({
      value: format(d, 'yyyy-MM-dd'),
      label: `Q${q} ${y}`,
    });
  }
  const filtered = out.filter((o) => o.value >= PLAN_VS_ACTUAL_EARLIEST_QUARTER_START);
  if (filtered.length > 0) return filtered;
  return [{ value: PLAN_VS_ACTUAL_EARLIEST_QUARTER_START, label: 'Q1 2026' }];
}

/** First day of each month inside the quarter (3 entries). */
export function monthsInQuarterOptions(quarterStartIso: string): { value: string; label: string }[] {
  const qs = parseISO(quarterStartIso);
  const y = qs.getFullYear();
  const m0 = qs.getMonth();
  return [0, 1, 2].map((i) => {
    const d = new Date(y, m0 + i, 1);
    return {
      value: format(d, 'yyyy-MM-dd'),
      label: format(d, 'MMMM yyyy'),
    };
  });
}

export function formatQuarterHeading(quarterStartIso: string): string {
  const qs = parseISO(quarterStartIso);
  const qe = endOfQuarter(qs);
  const qn = Math.floor(qs.getMonth() / 3) + 1;
  return `Q${qn} ${qs.getFullYear()} (${format(qs, 'MMM d')} – ${format(qe, 'MMM d, yyyy')})`;
}

/**
 * Quarter Results unlocks after the calendar quarter ends and (when known) after the
 * last in-quarter `release_schedule` launch date.
 */
export function isQuarterResultsWindowAvailable(
  quarterStartIso: string,
  asOf: Date = new Date(),
  lastQuarterReleaseLaunchIso?: string | null,
): boolean {
  const qs = parseISO(quarterStartIso);
  if (Number.isNaN(qs.getTime())) return false;

  const gates: Date[] = [endOfQuarter(qs)];
  if (lastQuarterReleaseLaunchIso?.trim()) {
    const ld = parseISO(lastQuarterReleaseLaunchIso.trim().slice(0, 10));
    if (!Number.isNaN(ld.getTime())) gates.push(ld);
  }
  const unlockOn = startOfDay(max(gates));
  return isAfter(startOfDay(asOf), unlockOn);
}

export function quarterProgressWindowOptions(
  quarterStartIso: string,
  lastQuarterReleaseLaunchIso?: string | null,
): QuarterProgressWindowOption[] {
  const months = monthsInQuarterOptions(quarterStartIso);
  const resultsAvailable = isQuarterResultsWindowAvailable(
    quarterStartIso,
    new Date(),
    lastQuarterReleaseLaunchIso,
  );
  const resultsLabel = resultsAvailable
    ? 'Quarter Results'
    : lastQuarterReleaseLaunchIso
      ? 'Quarter Results (after final quarter release)'
      : 'Quarter Results (after quarter ends)';

  const options: QuarterProgressWindowOption[] = [
    { value: 'quarter-plan', label: 'Quarter Plan (first snapshot)' },
    {
      value: 'quarter-progress-1',
      label: `Quarter one month in (${months[0].label})`,
    },
    {
      value: 'quarter-progress-2',
      label: `Quarter two months in (${months[1].label})`,
    },
    {
      value: 'quarter-results',
      label: resultsLabel,
      disabled: !resultsAvailable,
    },
  ];
  return options;
}

/** Latest selectable progress window for a quarter (never returns disabled quarter-results). */
export function latestAvailableQuarterProgressWindow(
  quarterStartIso: string,
  lastQuarterReleaseLaunchIso?: string | null,
): QuarterProgressWindow {
  if (isQuarterResultsWindowAvailable(quarterStartIso, new Date(), lastQuarterReleaseLaunchIso)) {
    return 'quarter-results';
  }
  return 'quarter-progress-2';
}

export function getInitialPlanVsActualPeriodState(): {
  quarterStartDate: string;
  quarterProgressWindow: QuarterProgressWindow;
} {
  const quarterStartDate = defaultQuarterStartDate();
  return {
    quarterStartDate,
    quarterProgressWindow: defaultQuarterProgressWindowForQuarter(quarterStartDate),
  };
}

/** @deprecated Use `QuarterProgressWindow` */
export type SnapshotWindowMode = QuarterProgressWindow;

/** @deprecated Use `quarterProgressWindowOptions` */
export function snapshotWindowOptions(quarterStartIso: string): { value: string; label: string }[] {
  return quarterProgressWindowOptions(quarterStartIso).map((o) => ({
    value: o.value,
    label: o.label,
  }));
}

/** @deprecated Use `defaultQuarterProgressWindowForQuarter` */
export function defaultSnapshotWindowForQuarter(quarterStartDate: string): string {
  return defaultQuarterProgressWindowForQuarter(quarterStartDate);
}
