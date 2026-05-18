import {
  addMonths,
  differenceInCalendarDays,
  endOfQuarter,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
} from 'date-fns';
import type { PlanVsActualPeriodType, PlanVsActualStatusCategory } from '@/types/roadmap';

/** Status labels where PM Internal/External cause is not shown in the table. */
export const PLAN_VS_ACTUAL_PM_CAUSE_HIDDEN_LABELS = new Set([
  'On Plan',
  'Delivered: On Time',
  'Delivered: Added',
  'Delivered: Early',
]);

export function shouldShowPlanVsActualPmCause(statusLabel: string): boolean {
  return !PLAN_VS_ACTUAL_PM_CAUSE_HIDDEN_LABELS.has(statusLabel);
}

/** Short release train for status column (e.g. `2026.5`). */
export function formatPlanVsActualReleaseLabel(release: string | null | undefined): string | null {
  const raw = (release ?? '').trim();
  if (!raw) return null;
  const parsed = parseReleaseTrainYearMonth(raw);
  if (parsed) return `${parsed.year}.${parsed.month}`;
  const stripped = raw.replace(/^release\s+/i, '').trim();
  return stripped || null;
}

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
  /** Earliest `aha_release` in the RPC scan window; used for net-new Delivered: Added vs On Time. */
  firstScanRelease?: string | null;
  /** Report period end (`yyyy-MM-dd`); gates “delivered” net-new chips vs `release_schedule` train launch. */
  periodEndIso?: string | null;
  /** Quarter Plan uses the first Q snapshot only — show planning baseline, not shipped chips. */
  periodType?: PlanVsActualPeriodType;
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

/** `release_schedule` launch date for a pivot-style release string (tries raw key and `release ` prefix variant). */
function launchDateForReleaseTrain(
  release: string | null | undefined,
  launchDateByKey: ReadonlyMap<string, Date>,
): Date | undefined {
  const k = normalizeReleaseKey(release);
  if (!k) return undefined;
  const direct = launchDateByKey.get(k);
  if (direct) return direct;
  const trainOnly = k.replace(/^release\s+/, '').trim();
  if (trainOnly) return launchDateByKey.get(trainOnly);
  return undefined;
}

/** Canonical train token for comparing Aha release labels (e.g. `2026.2` vs `Release 2026.2`). */
function releaseTrainIdentityKey(release: string | null | undefined): string | null {
  const k = normalizeReleaseKey(release);
  if (!k) return null;
  const t = k.replace(/^release\s+/, '').trim();
  return t || null;
}

/**
 * True when the epic's **end** release train has a scheduled launch on or before the report period end,
 * so a “shipped” Aha status can be attributed to that period. Missing schedule → true (no gate).
 */
export function deliveryKnowableByTrainSchedule(
  endRelease: string | null | undefined,
  periodEndIso: string | null | undefined,
  launchDateByKey?: ReadonlyMap<string, Date>,
): boolean {
  if (!periodEndIso?.trim() || !launchDateByKey?.size) return true;
  const ld = launchDateForReleaseTrain(endRelease, launchDateByKey);
  if (!ld) return true;
  const raw = periodEndIso.trim();
  const pe = parseISO(raw.length >= 10 ? raw.slice(0, 10) : `${raw}-01`);
  if (Number.isNaN(pe.getTime())) return true;
  return differenceInCalendarDays(startOfDay(ld), startOfDay(pe)) <= 0;
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

/**
 * True when **end** release train is strictly **before** **start** (period-start plan train).
 * Uses `release_schedule` order when both trains are indexed; otherwise compares parsed `YYYY.M` months.
 */
export function endTrainEarlierThanStartTrain(
  startRelease: string | null | undefined,
  endRelease: string | null | undefined,
  releaseOrderIndex: Map<string, number>,
): boolean {
  const sr = normalizeReleaseKey(startRelease);
  const er = normalizeReleaseKey(endRelease);
  if (!sr || !er) return false;
  const slots = slotDeltaBetween(sr, er, releaseOrderIndex);
  if (slots !== null) return slots < 0;
  const a = parseReleaseTrainYearMonth(startRelease);
  const b = parseReleaseTrainYearMonth(endRelease);
  if (!a || !b) return false;
  return b.year * 12 + b.month < a.year * 12 + a.month;
}

function looksReleasedBySnapshotSignals(row: DeriveStatusInput): boolean {
  if (looksDeliveredStatus(row.endStatus)) return true;
  const ep = row.endProgress;
  if (typeof ep === 'number' && !Number.isNaN(ep) && ep >= 100) return true;
  if (row.inStart && !row.inEnd && looksDeliveredStatus(row.startStatus)) return true;
  return false;
}

/**
 * Shipped/delivered for status chips: Aha wording or 100% progress, and the end release train
 * must have launched on or before the report period end when schedule data exists.
 */
function isReleasedForPlanVsActual(
  row: DeriveStatusInput,
  launchDateByKey?: ReadonlyMap<string, Date>,
): boolean {
  if (!looksReleasedBySnapshotSignals(row)) return false;
  const releaseForGate = row.inStart && !row.inEnd ? row.startRelease : row.endRelease;
  return deliveryKnowableByTrainSchedule(
    releaseForGate,
    row.periodEndIso ?? null,
    launchDateByKey,
  );
}

/**
 * Plan vs Actual row status (chip + filter group). Uses snapshot `in_start` / `in_end`, start vs end **Aha release** names,
 * `release_schedule` **launch order** (slot deltas) and optional **launch dates** (day gaps), delivered heuristics
 * (`looksDeliveredStatus`), and **`end_aha_progress` ≥ 100** when workflow text lags. No ClearGO `epic` table for chips.
 *
 * Labels: **On Plan**, **Ahead of Plan** (in flight, target train moved earlier vs period start), **Delivered: On Time**,
 * **Delivered: Early** (shipped on a train **earlier** than period-start plan), **Delivered: Delayed**, **Delayed**,
 * **Postponed**, **New Addition**, **Delivered: Added**, **Removed**.
 */
export function derivePlanVsActualStatus(
  row: DeriveStatusInput,
  releaseOrderIndex: Map<string, number>,
  launchDateByKey?: ReadonlyMap<string, Date>,
): { category: PlanVsActualStatusCategory; label: string } {
  if (row.periodType === 'quarter_baseline' && row.inStart && row.inEnd) {
    return { category: 'green', label: 'On Plan' };
  }

  const released = isReleasedForPlanVsActual(row, launchDateByKey);
  const sr = normalizeReleaseKey(row.startRelease);
  const er = normalizeReleaseKey(row.endRelease);
  const sameTrain = sr === er;
  const dayGap = calendarDaysBetweenReleaseTrains(row.startRelease, row.endRelease, launchDateByKey);
  const slots = slotDeltaBetween(sr, er, releaseOrderIndex);

  // Net-new this period
  if (!row.inStart && row.inEnd) {
    const rawReleased = looksReleasedBySnapshotSignals(row);
    const knowable = deliveryKnowableByTrainSchedule(
      row.endRelease,
      row.periodEndIso ?? null,
      launchDateByKey,
    );
    const netNewDelivered = rawReleased && knowable;
    if (!netNewDelivered) {
      return { category: 'neutral', label: 'New Addition' };
    }
    const fr = releaseTrainIdentityKey(row.firstScanRelease);
    const erId = releaseTrainIdentityKey(row.endRelease);
    if (fr && erId && fr === erId) {
      return { category: 'green', label: 'Delivered: On Time' };
    }
    return { category: 'green', label: 'Delivered: Added' };
  }

  // Dropped from final snapshot (pivot row missing at end)
  if (row.inStart && !row.inEnd) {
    if (released) {
      if (endTrainEarlierThanStartTrain(row.startRelease, row.endRelease, releaseOrderIndex)) {
        return { category: 'green', label: 'Delivered: Early' };
      }
      return { category: 'green', label: 'Delivered: On Time' };
    }
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
      if (endTrainEarlierThanStartTrain(row.startRelease, row.endRelease, releaseOrderIndex)) {
        return { category: 'green', label: 'Delivered: Early' };
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

    // Target moved earlier than quarter-start plan — not a slip
    if (endTrainEarlierThanStartTrain(row.startRelease, row.endRelease, releaseOrderIndex)) {
      return { category: 'green', label: 'Ahead of Plan' };
    }

    // Postponed: different target vs period start, still in flight, not Removed — cannot measure slip, or
    // neither "within 2 release slots" nor "<90d" on the launch schedule (user-facing OR rule for Delayed).
    const withinTwoReleaseSlots = slots !== null && slots > 0 && slots <= 2;
    const underNinetyDaySlip = dayGap !== null && dayGap < 90;
    const isDelayedSlip = withinTwoReleaseSlots || underNinetyDaySlip;

    if (slots === null && dayGap === null) {
      return { category: 'yellow', label: 'Postponed' };
    }

    if (isDelayedSlip) {
      return { category: 'yellow', label: 'Delayed' };
    }

    return { category: 'yellow', label: 'Postponed' };
  }

  return { category: 'neutral', label: 'New Addition' };
}
