/**
 * Chart window types and bounds for HEART trends.
 * Shared by service (API) and HeartMetricTracker (UI).
 */

export type HeartTrackerWindow = '7D' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'Max';

export function getWindowBounds(window: HeartTrackerWindow): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);

  switch (window) {
    case '7D':
      start.setDate(start.getDate() - 7);
      break;
    case '1M':
      start.setMonth(start.getMonth() - 1);
      break;
    case '3M':
      start.setMonth(start.getMonth() - 3);
      break;
    case '6M':
      start.setMonth(start.getMonth() - 6);
      break;
    case '1Y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'YTD':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'Max':
      start.setFullYear(start.getFullYear() - 5);
      break;
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/** Return start/end as YYYY-MM-DD for API use */
export function getWindowDateRange(window: HeartTrackerWindow): { startDate: string; endDate: string } {
  const { start, end } = getWindowBounds(window);
  return {
    startDate: start.toISOString().split('T')[0]!,
    endDate: end.toISOString().split('T')[0]!,
  };
}
