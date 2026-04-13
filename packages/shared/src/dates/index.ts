/**
 * @anthropic-internal/shared - Date Utilities
 *
 * Timezone-safe calendar date handling. Avoids the classic UTC midnight bug:
 *   new Date('2026-03-19') → UTC midnight → March 18 in US timezones.
 *
 * All functions operate on local calendar dates (YYYY-MM-DD strings) and
 * never produce off-by-one errors across timezones.
 *
 * Extracted from ClearGo's date-utils.ts.
 */

/**
 * Parse a YYYY-MM-DD string as a local calendar date (noon local time).
 * Returns null for invalid input instead of throwing.
 */
export function parseDateLocal(isoDate: string | null | undefined): Date | null {
  if (isoDate == null || isoDate === '') return null;
  const s = typeof isoDate === 'string' ? isoDate.trim().split('T')[0] : String(isoDate);
  const parts = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return null;
  const y = parseInt(parts[1], 10);
  const m = parseInt(parts[2], 10) - 1;
  const d = parseInt(parts[3], 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  const date = new Date(y, m, d);
  // Validate that Date didn't roll over (e.g. Feb 31 → Mar 3)
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

/**
 * Format a YYYY-MM-DD string for display using the local calendar date.
 * Returns empty string for invalid input.
 */
export function formatDateForDisplay(
  isoDate: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  locale: string = 'en-US',
): string {
  const date = parseDateLocal(isoDate);
  if (!date) return '';
  return date.toLocaleDateString(locale, options ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Format a Date object as YYYY-MM-DD in local time (no UTC shift).
 */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Normalize any ISO date string to YYYY-MM-DD (calendar date, no UTC shift).
 * Use when saving to the database to avoid storing the wrong day.
 */
export function normalizeToDateOnly(isoDate: string | null | undefined): string | null {
  const date = parseDateLocal(isoDate);
  if (!date) return null;
  return toDateString(date);
}

/** Add N calendar days in local time. */
export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** Subtract N calendar days in local time. */
export function subtractDays(d: Date, days: number): Date {
  return addDays(d, -days);
}

/** Add N calendar days to a YYYY-MM-DD string; returns YYYY-MM-DD or null. */
export function addDaysToDateString(ymd: string, deltaDays: number): string | null {
  const d = parseDateLocal(ymd);
  if (!d) return null;
  return toDateString(addDays(d, deltaDays));
}

/**
 * Same calendar day one month later. If that day doesn't exist in the
 * target month (e.g. Jan 31 → Feb), uses the last day of that month.
 */
export function addMonth(isoDate: string | null | undefined): string | null {
  const date = parseDateLocal(isoDate);
  if (!date) return null;
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const next = new Date(y, m + 1, d);
  // If the month rolled over (e.g. 31 → next month's 3rd), clamp to last day
  if (next.getDate() !== d) {
    next.setDate(0); // Last day of previous month
  }
  return toDateString(next);
}

/**
 * Whole-day difference between two YYYY-MM-DD strings.
 * Positive if `dateA` is after `dateB`.
 */
export function diffDays(
  dateA: string | null | undefined,
  dateB: string | null | undefined,
): number | null {
  if (!dateA || !dateB) return null;
  const keyA = dateA.trim().split('T')[0];
  const keyB = dateB.trim().split('T')[0];
  const mA = keyA?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mB = keyB?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!mA || !mB) return null;
  const utcA = Date.UTC(+mA[1], +mA[2] - 1, +mA[3]);
  const utcB = Date.UTC(+mB[1], +mB[2] - 1, +mB[3]);
  return Math.round((utcA - utcB) / 86_400_000);
}

/**
 * Get the calendar date (YYYY-MM-DD) for the given instant in a specific
 * IANA timezone. Falls back to local time if the timezone is invalid.
 */
export function getDateInTimezone(timeZone: string, instant: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return toDateString(instant);
  }
}

/**
 * Check if a YYYY-MM-DD string represents today in the given timezone.
 */
export function isToday(ymd: string, timeZone?: string): boolean {
  const today = timeZone ? getDateInTimezone(timeZone) : toDateString(new Date());
  return normalizeToDateOnly(ymd) === today;
}

/**
 * Check if a YYYY-MM-DD string is in the past relative to today.
 */
export function isPast(ymd: string, timeZone?: string): boolean {
  const today = timeZone ? getDateInTimezone(timeZone) : toDateString(new Date());
  const diff = diffDays(ymd, today);
  return diff !== null && diff < 0;
}
