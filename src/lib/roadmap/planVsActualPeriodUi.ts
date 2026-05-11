import {
  endOfQuarter,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  subMonths,
  subQuarters,
} from 'date-fns';
import type { PlanVsActualPeriodType } from '@/types/roadmap';

/** Start of the previous calendar month (local). */
export function previousCalendarMonthStart(): Date {
  return startOfMonth(subMonths(new Date(), 1));
}

/** Default: quarter that contains the previous calendar month. */
export function defaultQuarterStartDate(): string {
  return format(startOfQuarter(previousCalendarMonthStart()), 'yyyy-MM-dd');
}

/**
 * Quarter progress selector: baseline, month 1 / 2 in-quarter, or full quarter results.
 */
export type QuarterProgressWindow =
  | 'quarter-plan'
  | 'quarter-progress-1'
  | 'quarter-progress-2'
  | 'quarter-results';

export function planVsActualApiParams(
  quarterStartDate: string,
  window: QuarterProgressWindow,
): { periodType: PlanVsActualPeriodType; periodDate: string } {
  const months = monthsInQuarterOptions(quarterStartDate);
  switch (window) {
    case 'quarter-plan':
      return { periodType: 'quarter_baseline', periodDate: quarterStartDate };
    case 'quarter-progress-1':
      return { periodType: 'quarter_progress', periodDate: months[0].value };
    case 'quarter-progress-2':
      return { periodType: 'quarter_progress', periodDate: months[1].value };
    case 'quarter-results':
      return { periodType: 'quarterly', periodDate: quarterStartDate };
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
    if (ix === 2) return 'quarter-results';
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
  return out;
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

export function quarterProgressWindowOptions(quarterStartIso: string): {
  value: QuarterProgressWindow;
  label: string;
}[] {
  const months = monthsInQuarterOptions(quarterStartIso);
  return [
    { value: 'quarter-plan', label: 'Quarter Plan (first snapshot)' },
    {
      value: 'quarter-progress-1',
      label: `Quarter one month in (${months[0].label})`,
    },
    {
      value: 'quarter-progress-2',
      label: `Quarter two months in (${months[1].label})`,
    },
    { value: 'quarter-results', label: 'Quarter Results' },
  ];
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
