/**
 * Parse a date-only string (YYYY-MM-DD) as a local calendar date.
 * Avoids UTC midnight parsing: new Date('2026-03-19') is UTC midnight → March 18 in US timezones.
 */
export function parseDateOnlyLocal(isoDate: string | null | undefined): Date | null {
  if (isoDate == null || isoDate === '') return null;
  const s = typeof isoDate === 'string' ? isoDate.trim().split('T')[0] : String(isoDate);
  const parts = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return null;
  const y = parseInt(parts[1], 10);
  const m = parseInt(parts[2], 10) - 1;
  const d = parseInt(parts[3], 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

/**
 * Format a date-only string (YYYY-MM-DD) for display using local calendar date (no UTC shift).
 */
export function formatDateOnlyForDisplay(
  isoDate: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = parseDateOnlyLocal(isoDate);
  if (!date) return '';
  return date.toLocaleDateString('en-US', options ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Format a Date as YYYY-MM-DD in local time (no UTC shift).
 * Use when computing stage end dates so they match the timeline and display.
 */
export function dateToLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add N calendar days in local time (stage timeline math). */
export function addCalendarDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** Subtract N calendar days in local time. */
export function subtractCalendarDays(d: Date, days: number): Date {
  return addCalendarDays(d, -days);
}

/**
 * Normalize an ISO or date string to YYYY-MM-DD (calendar date, no UTC shift).
 * Use when saving to DB so we never store a value that displays as the wrong day.
 */
export function toDateOnlyString(isoDate: string | null | undefined): string | null {
  const date = parseDateOnlyLocal(isoDate);
  if (!date) return null;
  return dateToLocalDateString(date);
}

/**
 * Same calendar day one month later, as YYYY-MM-DD (local calendar, no UTC shift).
 * If that day does not exist in the target month (e.g. Jan 31 → Feb), uses the last day of that month.
 * Used as fallback for Cohort 2 when release_schedule has no next release.
 */
export function addCalendarMonth(isoDate: string | null | undefined): string | null {
  const date = parseDateOnlyLocal(isoDate);
  if (!date) return null;
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const next = new Date(y, m + 1, d);
  if (next.getDate() !== d) {
    next.setDate(0);
  }
  const y2 = next.getFullYear();
  const m2 = String(next.getMonth() + 1).padStart(2, '0');
  const d2 = String(next.getDate()).padStart(2, '0');
  return `${y2}-${m2}-${d2}`;
}

/** Calendar YYYY-MM-DD for `instant` in an IANA timezone (e.g. app settings). */
export function getCalendarDateStringInTimeZone(timeZone: string, instant: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return dateToLocalDateString(instant);
  }
}

/** Add calendar days to a YYYY-MM-DD string; returns YYYY-MM-DD or null. */
export function addCalendarDaysToYmd(ymd: string, deltaDays: number): string | null {
  const key = ymd.trim().split('T')[0];
  const d = parseDateOnlyLocal(key);
  if (!d) return null;
  return dateToLocalDateString(addCalendarDays(d, deltaDays));
}

/**
 * Returns the GA Cohort 2 date for the given release on the UI-rollout timeline.
 * Priority:
 *  1. `cohort2_date` stored on the release_schedule row (authoritative, from Aha!)
 *  2. Earliest launch_date in the schedule that is strictly after the current release's launch_date
 *  3. +1 calendar month fallback
 */
export function getCohort2DateForTimeline(
    currentReleaseName: string,
    launchDate: string,
    schedule: Array<{ release_name: string; launch_date: string | null; cohort2_date?: string | null }>
): string | null {
    const current = schedule.find(r => r.release_name === currentReleaseName);
    if (current?.cohort2_date) return current.cohort2_date;

    const anchor = parseDateOnlyLocal(launchDate);
    if (!anchor) return addCalendarMonth(launchDate);
    let best: { d: Date; iso: string } | null = null;
    for (const r of schedule) {
        if (!r.launch_date || r.release_name === currentReleaseName) continue;
        const d = parseDateOnlyLocal(r.launch_date);
        if (!d || d <= anchor) continue;
        const iso = r.launch_date.includes('T') ? r.launch_date.split('T')[0]! : r.launch_date;
        if (!best || d < best.d) best = { d, iso };
    }
    return best?.iso ?? addCalendarMonth(launchDate);
}

/**
 * Whole-day difference dueYmd - todayYmd using civil calendar (no UTC-midnight parsing).
 * Positive if the due date is after "today".
 */
export function diffCalendarDaysBetweenYmd(
  dueYmd: string | null | undefined,
  todayYmd: string | null | undefined
): number | null {
  if (!todayYmd) return null;
  const dueKey = dueYmd?.trim().split('T')[0];
  if (!dueKey) return null;
  const m1 = dueKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const m2 = todayYmd.trim().split('T')[0]?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m1 || !m2) return null;
  const utcDue = Date.UTC(+m1[1], +m1[2] - 1, +m1[3]);
  const utcToday = Date.UTC(+m2[1], +m2[2] - 1, +m2[3]);
  return Math.round((utcDue - utcToday) / 86400000);
}
