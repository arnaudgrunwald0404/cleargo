/**
 * US business-day calendar used to hold back scheduled outbound notifications.
 *
 * Scheduled jobs (criteria nudges, retro reminders, digests, alerts) should only
 * reach people on US business days in the org timezone — never Saturdays, Sundays,
 * or company-observed holidays. Notifications triggered by a person's action
 * (assignment, comment, delegation, go/no-go) are deliberately not affected.
 *
 * Company-specific closures that are not federal holidays (e.g. the Friday after
 * Thanksgiving, Christmas Eve) can be added with the `EXTRA_NOTIFICATION_HOLIDAYS`
 * env var: comma-separated `YYYY-MM-DD` entries, optionally `YYYY-MM-DD:Label`.
 */

import { dateToLocalDateString, parseDateOnlyLocal } from '@/lib/date-utils';

/** Why a calendar day is not a business day. `label` is safe to log or return in JSON. */
export type NonBusinessDayReason =
    | { kind: 'weekend'; label: string }
    | { kind: 'holiday'; label: string };

type FixedHoliday = { month: number; day: number; name: string };
type FloatingHoliday = { month: number; weekday: number; nth: number | 'last'; name: string };

/**
 * Fixed-date observed holidays. Saturday dates are observed Friday, Sunday dates Monday.
 * Columbus Day and Veterans Day are federal holidays the company works, so they are
 * deliberately absent — notifications go out on those days as normal.
 */
const FIXED_HOLIDAYS: FixedHoliday[] = [
    { month: 0, day: 1, name: "New Year's Day" },
    { month: 5, day: 19, name: 'Juneteenth' },
    { month: 6, day: 4, name: 'Independence Day' },
    { month: 11, day: 25, name: 'Christmas Day' },
];

/** Holidays pinned to a weekday — these never need observance shifting. */
const FLOATING_HOLIDAYS: FloatingHoliday[] = [
    { month: 0, weekday: 1, nth: 3, name: 'Martin Luther King Jr. Day' },
    { month: 1, weekday: 1, nth: 3, name: "Presidents' Day" },
    { month: 4, weekday: 1, nth: 'last', name: 'Memorial Day' },
    { month: 8, weekday: 1, nth: 1, name: 'Labor Day' },
    { month: 10, weekday: 4, nth: 4, name: 'Thanksgiving Day' },
];

const holidayCacheByYear = new Map<number, Map<string, string>>();

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
    const first = new Date(year, month, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return new Date(year, month, 1 + offset + (nth - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
    const last = new Date(year, month + 1, 0);
    const offset = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month, last.getDate() - offset);
}

/** Saturday holidays are observed the Friday before, Sunday holidays the Monday after. */
function observedDate(date: Date): { date: Date; shifted: boolean } {
    const dow = date.getDay();
    if (dow === 6) return { date: new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1), shifted: true };
    if (dow === 0) return { date: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1), shifted: true };
    return { date, shifted: false };
}

/**
 * Company-observed US holidays for a calendar year, keyed by YYYY-MM-DD.
 * Includes next year's New Year's Day when it is observed on Dec 31 of this year.
 */
export function getObservedUsHolidays(year: number): Map<string, string> {
    const cached = holidayCacheByYear.get(year);
    if (cached) return cached;

    const holidays = new Map<string, string>();

    const addObserved = (date: Date, name: string) => {
        const { date: observed, shifted } = observedDate(date);
        if (observed.getFullYear() !== year) return;
        holidays.set(dateToLocalDateString(observed), shifted ? `${name} (observed)` : name);
    };

    for (const h of FIXED_HOLIDAYS) {
        addObserved(new Date(year, h.month, h.day), h.name);
    }
    // Jan 1 next year on a Saturday is observed on Dec 31 of this year.
    addObserved(new Date(year + 1, 0, 1), "New Year's Day");

    for (const h of FLOATING_HOLIDAYS) {
        const date =
            h.nth === 'last'
                ? lastWeekdayOfMonth(year, h.month, h.weekday)
                : nthWeekdayOfMonth(year, h.month, h.weekday, h.nth);
        holidays.set(dateToLocalDateString(date), h.name);
    }

    holidayCacheByYear.set(year, holidays);
    return holidays;
}

/** Company-specific closure days from `EXTRA_NOTIFICATION_HOLIDAYS`, keyed by YYYY-MM-DD. */
export function getExtraHolidays(): Map<string, string> {
    const raw = process.env.EXTRA_NOTIFICATION_HOLIDAYS;
    const extras = new Map<string, string>();
    if (!raw) return extras;

    for (const entry of raw.split(',')) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const separator = trimmed.indexOf(':');
        const ymd = (separator === -1 ? trimmed : trimmed.slice(0, separator)).trim();
        const label = separator === -1 ? '' : trimmed.slice(separator + 1).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
        extras.set(ymd, label || 'company holiday');
    }
    return extras;
}

/** True when the YYYY-MM-DD date falls on a Saturday or Sunday. */
export function isWeekendYmd(ymd: string): boolean {
    const date = parseDateOnlyLocal(ymd);
    if (!date) return false;
    const dow = date.getDay();
    return dow === 0 || dow === 6;
}

/** Holiday name for a YYYY-MM-DD date (observed US holiday or company extra), else null. */
export function getHolidayName(ymd: string): string | null {
    const date = parseDateOnlyLocal(ymd);
    if (!date) return null;
    const key = dateToLocalDateString(date);
    return getExtraHolidays().get(key) ?? getObservedUsHolidays(date.getFullYear()).get(key) ?? null;
}

/** Why `ymd` is not a business day, or null when it is one. */
export function getNonBusinessDayReason(ymd: string): NonBusinessDayReason | null {
    const date = parseDateOnlyLocal(ymd);
    if (!date) return null;

    if (isWeekendYmd(ymd)) {
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        return { kind: 'weekend', label: `weekend (${dayName})` };
    }

    const holiday = getHolidayName(ymd);
    if (holiday) return { kind: 'holiday', label: `US holiday (${holiday})` };

    return null;
}

/** True when `ymd` is a weekday that is not a holiday. */
export function isBusinessDayYmd(ymd: string): boolean {
    return parseDateOnlyLocal(ymd) !== null && getNonBusinessDayReason(ymd) === null;
}

/**
 * First business day of the Monday-anchored week containing `ymd`.
 * Lets weekly jobs slide to Tuesday when Monday is a holiday instead of losing the week.
 */
export function getFirstBusinessDayOfWeekYmd(ymd: string): string | null {
    const date = parseDateOnlyLocal(ymd);
    if (!date) return null;

    const daysSinceMonday = (date.getDay() + 6) % 7;
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday);

    for (let offset = 0; offset < 5; offset++) {
        const candidate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
        const candidateYmd = dateToLocalDateString(candidate);
        if (isBusinessDayYmd(candidateYmd)) return candidateYmd;
    }
    // Whole week closed (only possible via EXTRA_NOTIFICATION_HOLIDAYS): fall back to Monday.
    return dateToLocalDateString(monday);
}

/** How often a job is scheduled: `daily` runs every business day, `weekly` once per week. */
export type NotificationCadence = 'daily' | 'weekly';

export type NotificationCalendarDecision =
    | { send: true }
    | { send: false; reason: string };

/**
 * Whether a scheduled notification job should send on `todayYmd`.
 * `weekly` jobs additionally wait for the week's first business day, so a holiday
 * Monday defers the send to Tuesday rather than skipping the week.
 */
export function evaluateNotificationCalendar(
    todayYmd: string,
    cadence: NotificationCadence = 'daily'
): NotificationCalendarDecision {
    const nonBusinessDay = getNonBusinessDayReason(todayYmd);
    if (nonBusinessDay) return { send: false, reason: nonBusinessDay.label };

    if (cadence === 'weekly') {
        const firstBusinessDay = getFirstBusinessDayOfWeekYmd(todayYmd);
        if (firstBusinessDay && firstBusinessDay !== todayYmd) {
            return {
                send: false,
                reason: `not the first business day of the week (sent ${firstBusinessDay})`,
            };
        }
    }

    return { send: true };
}
