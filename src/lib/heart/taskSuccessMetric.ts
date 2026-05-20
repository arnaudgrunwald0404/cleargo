/**
 * Task Success (completion_rate / success_rate) value helpers.
 * Single-event metrics use % of users (Pendo getEventPercentage).
 * Two-event metrics use start→complete event count ratio.
 */

import type { MetricContext } from './types';

export function isTaskSuccessRateType(measurementType: string): boolean {
  return measurementType === 'completion_rate' || measurementType === 'success_rate';
}

export function computeTwoEventCompletionPercent(
  startCount: number,
  completeCount: number
): number {
  if (startCount <= 0) return 0;
  return (completeCount / startCount) * 100;
}

export interface SingleEventTaskSuccessRaw {
  completionCount: number;
  uniqueVisitors: number;
  totalAppVisitors: number;
}

export function buildSingleEventTaskSuccessDescription(
  uniqueVisitors: number,
  totalAppVisitors: number,
  periodPct: number
): string {
  const pctStr = periodPct.toFixed(1);
  const inSegment = '';
  return `${uniqueVisitors.toLocaleString()} unique visitors completed this action out of ${totalAppVisitors.toLocaleString()} total app visitors${inSegment} in this period. Task Success = ${pctStr}% (${uniqueVisitors.toLocaleString()} ÷ ${totalAppVisitors.toLocaleString()}).`;
}

export function hasTaskSuccessPeriodPercentageRaw(
  raw: MetricContext['raw']
): raw is SingleEventTaskSuccessRaw {
  if (!raw) return false;
  return (
    typeof raw.uniqueVisitors === 'number' &&
    typeof raw.totalAppVisitors === 'number' &&
    raw.totalAppVisitors > 0 &&
    !('startCount' in raw && typeof (raw as { startCount?: number }).startCount === 'number')
  );
}
