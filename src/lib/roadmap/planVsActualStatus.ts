import {
  addMonths,
  differenceInCalendarDays,
  endOfQuarter,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
} from 'date-fns';
import type { PlanVsActualPeriodType, PlanVsActualStatusCategory } from '@/types/roadmap';

function normalize(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function normalizeReleaseKey(s: string | null | undefined): string {
  return normalize(s);
}

/**
 * Aha! workflow names ClearCompany treats as shipped/delivered for Plan vs Actual (substring match, lowercase).
 * Keep in sync with roadmap pivot status strings.
 */
export const PLAN_VS_ACTUAL_DELIVERED_STATUS_MARKERS = [
  'feature complete',
  'released to gtm team',
  'released to internal orgs',
  'released to cohort 1',
  'complete/done (ga)',
] as const;

/** Heuristic: Aha! shipped / complete wording varies by workspace. */
export function looksDeliveredStatus(status: string | null | undefined): boolean {
  const n = normalize(status);
  if (!n) return false;
  if (PLAN_VS_ACTUAL_DELIVERED_STATUS_MARKERS.some((m) => n.includes(m))) return true;
  return (
    n.includes('ship') ||
    n.includes('released') ||
    n.includes('release ga') ||
    n.includes('done') ||
    n.includes('complete') ||
    n === 'will not implement'
  );
}

export interface ReportingReleaseScope {
  /** Parsed `YYYY.M` train months allowed for this report (see `allowedTrainMonthKeysForPlanVsActualReport`). */
  allowedTrainMonthKeys: ReadonlySet<number>;
}

export interface DeriveStatusInput {
  inStart: boolean;
  inEnd: boolean;
  startRelease: string | null;
  endRelease: string | null;
  startStatus: string | null;
  endStatus: string | null;
  /** Latest in-period snapshot progress % (RPC `end_aha_progress`); used when Aha status lags behind 100% work. */
  endProgress?: number | null;
}

/**
 * Keeps rows whose **release train** matches the report’s calendar scope (`allowedTrainMonthKeys`).
 * Trains parse as `YYYY.M` / `YYYY.MM` from Aha-style names.
 *
 * - **Still on roadmap at period end** (`inEnd`): compare **endRelease** (planned train at last snapshot).
 * - **Removed mid-period** (`inStart && !inEnd`): compare **startRelease** (train at first snapshot).
 * - **Unparseable or missing** release for that check: row is kept (not excluded).
 */
export function includePlanVsActualItemForReport(
  item: Pick<DeriveStatusInput, 'inStart' | 'inEnd' | 'startRelease' | 'endRelease'>,
  scope: ReportingReleaseScope,
): boolean {
  if (item.inStart && !item.inEnd) {
    const m = releaseTrainMatchesReportingScope(item.startRelease, scope);
    return m !== false;
  }
  if (item.inEnd) {
    const m = releaseTrainMatchesReportingScope(item.endRelease, scope);
    return m !== false;
  }
  return true;
}

/**
 * Parses release trains named `YYYY.M` or `YYYY.MM` (optional `Release ` prefix), Aha-style.
 */
export function parseReleaseTrainYearMonth(
  release: string | null | undefined,
): { year: number; month: number } | null {
  const raw = (release ?? '').trim();
  if (!raw) return null;
  const s = raw.replace(/^release\s+/i, '').trim();
  const m = /^(\d{4})\.(\d{1,2})\b/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Keys like `202604` for calendar months from period bounds (inclusive). */
export function calendarMonthKeysForPeriod(periodStartIso: string, periodEndIso: string): Set<number> {
  const set = new Set<number>();
  let cur = startOfMonth(parseISO(periodStartIso));
  const last = startOfMonth(parseISO(periodEndIso));
  while (cur.getTime() <= last.getTime()) {
    set.add(cur.getFullYear() * 100 + cur.getMonth() + 1);
    cur = addMonths(cur, 1);
  }
  return set;
}

/**
 * Month keys used when filtering Plan vs Actual rows by Aha release train vs the selected period.
 *
 * - **quarterly** (Quarter Results): months in that calendar quarter.
 * - **quarter_baseline**, **quarter_progress**, **monthly**: full quarter containing `periodStart` (in-quarter trains).
 */
export function allowedTrainMonthKeysForPlanVsActualReport(
  periodType: PlanVsActualPeriodType,
  periodStartIso: string,
  periodEndIso: string,
): Set<number> {
  if (periodType === 'quarterly') {
    return calendarMonthKeysForPeriod(periodStartIso, periodEndIso);
  }
  const anchor = startOfMonth(parseISO(periodStartIso.length === 7 ? `${periodStartIso}-01` : periodStartIso));
  const qs = startOfQuarter(anchor);
  const qe = endOfQuarter(anchor);
  return calendarMonthKeysForPeriod(format(qs, 'yyyy-MM-dd'), format(qe, 'yyyy-MM-dd'));
}

export function releaseTrainMatchesReportingScope(
  endRelease: string | null | undefined,
  scope: ReportingReleaseScope,
): boolean | null {
  const parsed = parseReleaseTrainYearMonth(endRelease);
  if (!parsed) return null;
  const key = parsed.year * 100 + parsed.month;
  return scope.allowedTrainMonthKeys.has(key);
}

/** Calendar days from start-release train to end-release train (positive = slipped later). */
export function calendarDaysBetweenReleaseTrains(
  startRelease: string | null | undefined,
  endRelease: string | null | undefined,
  launchDateByKey: ReadonlyMap<string, Date> | undefined,
): number | null {
  if (!launchDateByKey || launchDateByKey.size === 0) return null;
  const s = normalizeReleaseKey(startRelease);
  const e = normalizeReleaseKey(endRelease);
  if (!s || !e) return null;
  const ds = launchDateByKey.get(s);
  const de = launchDateByKey.get(e);
  if (!ds || !de) return null;
  return differenceInCalendarDays(de, ds);
}

function slotDeltaBetween(
  sr: string,
  er: string,
  releaseOrderIndex: Map<string, number>,
): number | null {
  if (!sr || !er) return null;
  const si = releaseOrderIndex.get(sr);
  const ei = releaseOrderIndex.get(er);
  if (si === undefined || ei === undefined) return null;
  return ei - si;
}

function isReleasedForPlanVsActual(row: DeriveStatusInput): boolean {
  if (looksDeliveredStatus(row.endStatus)) return true;
  const ep = row.endProgress;
  if (typeof ep === 'number' && !Number.isNaN(ep) && ep >= 100) return true;
  if (row.inStart && !row.inEnd && looksDeliveredStatus(row.startStatus)) return true;
  return false;
}

/**
 * Plan vs Actual row status (chip + filter group). Uses snapshot `in_start` / `in_end`, start vs end **Aha release** names,
 * `release_schedule` **launch order** (slot deltas) and optional **launch dates** (day gaps), delivered heuristics
 * (`looksDeliveredStatus`), and **`end_aha_progress` ≥ 100** when workflow text lags. No ClearGO `epic` table for chips.
 *
 * Labels: **On Plan**, **Delivered: On Time**, **Delivered: Delayed**, **Postponed**, **New Addition**, **Delivered: Added**, **Removed**.
 */
export function derivePlanVsActualStatus(
  row: DeriveStatusInput,
  releaseOrderIndex: Map<string, number>,
  launchDateByKey?: ReadonlyMap<string, Date>,
): { category: PlanVsActualStatusCategory; label: string } {
  const released = isReleasedForPlanVsActual(row);
  const sr = normalizeReleaseKey(row.startRelease);
  const er = normalizeReleaseKey(row.endRelease);
  const sameTrain = sr === er;
  const dayGap = calendarDaysBetweenReleaseTrains(row.startRelease, row.endRelease, launchDateByKey);
  const slots = slotDeltaBetween(sr, er, releaseOrderIndex);

  // Net-new this period
  if (!row.inStart && row.inEnd) {
    if (released) return { category: 'green', label: 'Delivered: Added' };
    return { category: 'neutral', label: 'New Addition' };
  }

  // Dropped from final snapshot (pivot row missing at end)
  if (row.inStart && !row.inEnd) {
    if (released) return { category: 'green', label: 'Delivered: On Time' };
    return { category: 'red', label: 'Removed' };
  }

  // Compared in both snapshots
  if (row.inStart && row.inEnd) {
    if (released) {
      if (!sr && !er) {
        return { category: 'green', label: 'Delivered: On Time' };
      }
      if (sameTrain) {
        return { category: 'green', label: 'Delivered: On Time' };
      }
      // Earlier train is still "on time" delivery; later train is delayed delivery
      if (slots !== null && slots < 0) {
        return { category: 'green', label: 'Delivered: On Time' };
      }
      return { category: 'yellow', label: 'Delivered: Delayed' };
    }

    // Not released
    if (!sr && !er) {
      return { category: 'green', label: 'On Plan' };
    }
    if (sameTrain) {
      return { category: 'green', label: 'On Plan' };
    }

    // Different train, still in flight — vs quarter-start plan
    if (dayGap !== null && dayGap >= 200) {
      return { category: 'red', label: 'Removed' };
    }

    // Postponed: slipped beyond two release slots OR 90+ calendar days (alternate rule), still <200d
    const isPostponed =
      (slots !== null && slots > 2) ||
      (dayGap !== null && dayGap >= 90) ||
      (slots === null && dayGap === null);

    if (isPostponed) {
      return { category: 'yellow', label: 'Postponed' };
    }

    // Minor reschedule: ≤2 slots and <90d (or unknown days with ≤2 slots) — treat like on-plan execution risk
    return { category: 'green', label: 'On Plan' };
  }

  return { category: 'neutral', label: 'New Addition' };
}
