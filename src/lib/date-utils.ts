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
