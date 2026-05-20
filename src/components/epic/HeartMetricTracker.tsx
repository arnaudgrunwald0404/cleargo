"use client";

import React, { useMemo, useState } from 'react';
import { Group, SegmentedControl, Stack, Text } from '@mantine/core';
import type { HeartMetricDisplay } from '@/lib/heart/types';
import { isTaskSuccessRateType, hasTaskSuccessPeriodPercentageRaw } from '@/lib/heart/taskSuccessMetric';
import { getWindowBounds, type HeartTrackerWindow } from '@/lib/heart/window';
import { parseDateOnlyLocal } from '@/lib/date-utils';

export type { HeartTrackerWindow };
export { getWindowBounds };

const WINDOW_OPTIONS: { value: HeartTrackerWindow; label: string }[] = [
  { value: '7D', label: '7D' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: 'YTD', label: 'YTD' },
  { value: 'Max', label: 'Max' },
];

export function toDateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Nice Y-axis ticks for percentages: 0, 25, 50, 75, 100 (subset that covers [min, max]) */
function getPercentageTicks(dataMin: number, dataMax: number): number[] {
  const candidates = [0, 25, 50, 75, 100];
  const lo = Math.min(dataMin, 0);
  const hi = Math.max(dataMax, 100);
  return candidates.filter((t) => t >= lo && t <= hi);
}

/** Nice Y-axis domain for percentages: clamp to 0–100 or expand slightly with whole-number bounds */
function getPercentageDomain(dataMin: number, dataMax: number): { min: number; max: number } {
  const range = dataMax - dataMin || 1;
  const paddedMin = Math.max(0, Math.floor((dataMin - range * 0.05) / 25) * 25);
  const paddedMax = Math.min(100, Math.ceil((dataMax + range * 0.05) / 25) * 25);
  return {
    min: paddedMin,
    max: Math.max(paddedMax, paddedMin + 25),
  };
}

/** Nice step size for non-percentage axes (whole numbers) */
function niceStep(range: number, maxTicks: number): number {
  const rough = range / Math.max(1, maxTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

/** Nice Y-axis domain and ticks for non-percentage (whole numbers, clean intervals) */
function getNiceDomainAndTicks(
  dataMin: number,
  dataMax: number,
  maxTicks: number = 5
): { min: number; max: number; ticks: number[] } {
  const range = dataMax - dataMin || 1.0;
  const step = niceStep(range, maxTicks);
  const min = Math.floor(dataMin / step) * step;
  const max = Math.ceil(dataMax / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step * 0.5; t += step) {
    ticks.push(Number(t.toFixed(10))); // avoid float noise
  }
  return {
    min: Math.min(min, dataMin),
    max: Math.max(max, dataMax),
    ticks: ticks.length > 0 ? ticks : [dataMin, dataMax],
  };
}

/** Per-user axis: whole numbers only; ticks in sensible steps (1,2,5,10 or 1K,2K,5K,10K) so labels are never "0K/user" */
function getPerUserDomainAndTicks(
  dataMin: number,
  dataMax: number,
  maxTicks: number = 5
): { min: number; max: number; ticks: number[] } {
  const range = Math.max(dataMax - dataMin, 0) || 1;
  const isLarge = dataMax >= 1000;
  let step: number;
  if (isLarge) {
    const rough = range / maxTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    if (norm <= 1) step = mag;
    else if (norm <= 2) step = 2 * mag;
    else if (norm <= 5) step = 5 * mag;
    else step = 10 * mag;
    step = Math.max(1000, Math.round(step / 1000) * 1000);
  } else {
    step = niceStep(range, maxTicks);
    step = Math.max(1, Math.round(step));
  }
  const min = isLarge
    ? Math.max(0, Math.floor(dataMin / step) * step)
    : Math.max(0, Math.floor(dataMin / step) * step);
  const max = Math.ceil(dataMax / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step * 0.5; t += step) {
    ticks.push(Number(t.toFixed(0)));
  }
  if (ticks.length === 0) ticks.push(0, Math.max(1, dataMax));
  return {
    min: Math.min(min, dataMin),
    max: Math.max(max, dataMax),
    ticks,
  };
}

/** Format a single Y-axis or tooltip value for per-user: whole numbers, K only when >= 1000 and never "0K" */
function formatPerUserValue(v: number): string {
  if (v >= 1000) {
    const k = Math.round(v / 1000);
    return k >= 1 ? `${k}K` : String(Math.round(v));
  }
  return String(Math.round(v));
}

interface HeartMetricTrackerProps {
  item: HeartMetricDisplay;
  releaseDate: string | null;
  /** Chart height in pixels */
  height?: number;
  /** Show optional fill under the line */
  showFill?: boolean;
  /** When true, chart stretches to full width of container (no fixed 400px) */
  fullWidth?: boolean;
  /** Controlled chart window (e.g. 1M); when set, cards show period average for this window */
  window?: HeartTrackerWindow;
  /** Called when user changes the period; use with window to sync cards with chart */
  onWindowChange?: (window: HeartTrackerWindow) => void;
}

export function HeartMetricTracker({
  item,
  releaseDate,
  height = 200,
  showFill = true,
  fullWidth = false,
  window: controlledWindow,
  onWindowChange,
}: HeartMetricTrackerProps) {
  const [internalWindow, setInternalWindow] = useState<HeartTrackerWindow>('7D');
  const window = controlledWindow ?? internalWindow;
  const setWindow = onWindowChange ?? setInternalWindow;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { category, metric, latestSnapshot, history = [], historyUnit, metricContext } = item;

  const { points, windowStart, windowEnd, displayWindowEnd, releaseIndex, valueMin, valueMax, yTickValues, displayUnit } = useMemo(() => {
    const { start, end } = getWindowBounds(window);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);

    const pointMap = new Map<string, number>();
    for (const s of history) {
      if (s.value === null || s.value === undefined) continue;
      if (s.snapshot_date >= startKey && s.snapshot_date <= endKey) {
        pointMap.set(s.snapshot_date, s.value);
      }
    }
    if (!historyUnit && latestSnapshot?.value !== null && latestSnapshot?.value !== undefined) {
      const todayKey = toDateKey(new Date());
      if (todayKey >= startKey && todayKey <= endKey) {
        pointMap.set(latestSnapshot.snapshot_date, latestSnapshot.value);
      }
    }

    const sortedDates = Array.from(pointMap.keys()).sort();
    let points = sortedDates.map((date) => ({ date, value: pointMap.get(date)! }));

    // Adoption: show period-level adoption (matches card), not daily %, so chart is ~3% not 90s
    const raw = metricContext?.raw;
    if (
      metric?.measurement_type === 'unique_users_percentage' &&
      typeof raw?.uniqueVisitors === 'number' &&
      typeof raw?.totalAppVisitors === 'number' &&
      raw.totalAppVisitors > 0 &&
      points.length > 0
    ) {
      const periodPct = (raw.uniqueVisitors / raw.totalAppVisitors) * 100;
      points = points.map((p) => ({ date: p.date, value: periodPct }));
    }
    if (
      isTaskSuccessRateType(metric?.measurement_type ?? '') &&
      (metric?.pendo_event_ids?.length ?? 0) === 1 &&
      hasTaskSuccessPeriodPercentageRaw(raw) &&
      points.length > 0
    ) {
      const periodPct = (raw.uniqueVisitors / raw.totalAppVisitors) * 100;
      points = points.map((p) => ({ date: p.date, value: periodPct }));
    }
    const values = points.map((p) => p.value);
    const dataMin = values.length > 0 ? Math.min(...values) : 0;
    const dataMax = values.length > 0 ? Math.max(...values) : 1;

    let releaseIndex: number | null = null;
    if (releaseDate && sortedDates.length > 0) {
      const releaseKey = releaseDate.split('T')[0];
      const idx = sortedDates.indexOf(releaseKey);
      if (idx >= 0) releaseIndex = idx;
      else if (releaseKey >= sortedDates[0] && releaseKey <= sortedDates[sortedDates.length - 1]) {
        const insertIdx = sortedDates.findIndex((d) => d >= releaseKey);
        releaseIndex = insertIdx >= 0 ? insertIdx : sortedDates.length;
      }
    }

    let unit = '';
    if (historyUnit === 'frustration' || historyUnit === 'completions') {
      unit = '';
    } else {
      const isPct = metric?.measurement_type?.includes('percentage') || metric?.measurement_type?.includes('rate');
      unit = isPct ? '%' : metric?.measurement_type?.includes('per_user') ? '/user' : '';
    }

    const isPct = unit === '%';
    const isPerUser = unit === '/user';
    let valueMin: number;
    let valueMax: number;
    let yTickValues: number[];
    if (isPct) {
      const domain = getPercentageDomain(dataMin, dataMax);
      valueMin = domain.min;
      valueMax = domain.max;
      yTickValues = getPercentageTicks(valueMin, valueMax);
    } else if (isPerUser) {
      const perUser = getPerUserDomainAndTicks(dataMin, dataMax, 5);
      valueMin = perUser.min;
      valueMax = perUser.max;
      yTickValues = perUser.ticks;
    } else {
      const nice = getNiceDomainAndTicks(dataMin, dataMax, 5);
      valueMin = nice.min;
      valueMax = nice.max;
      yTickValues = nice.ticks;
    }

    // Cap right edge to last data date when data doesn't extend to window end (avoids empty gap)
    const lastDataKey = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1]! : null;
    const displayWindowEnd = lastDataKey && lastDataKey < endKey ? lastDataKey : endKey;

    return {
      points,
      windowStart: startKey,
      windowEnd: endKey,
      displayWindowEnd,
      releaseIndex,
      valueMin,
      valueMax,
      yTickValues,
      displayUnit: unit,
    };
  }, [window, history, latestSnapshot, releaseDate, metric?.measurement_type, historyUnit, metricContext?.raw]);

  if (points.length < 1) {
    return (
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="xs" c="dimmed">No data in selected window</Text>
          <SegmentedControl
            size="xs"
            data={WINDOW_OPTIONS}
            value={window}
            onChange={(v) => setWindow(v as HeartTrackerWindow)}
          />
        </Group>
      </Stack>
    );
  }

  const chartWidth = fullWidth ? 1200 : 400;
  const isPerUserAxis = displayUnit === '/user';
  const padding = {
    top: 16,
    right: 12,
    bottom: 28,
    left: isPerUserAxis ? 52 : 44,
  };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const toTime = (date: string) => new Date(date).getTime();
  // X-axis ends at last data date when data doesn't reach window end (avoids gap before Release)
  const minTime = toTime(windowStart);
  const maxTime = toTime(displayWindowEnd);
  const timeRange = Math.max(maxTime - minTime, 86400000);

  const xForDate = (date: string) =>
    padding.left + ((toTime(date) - minTime) / timeRange) * innerW;
  const y = (v: number) =>
    padding.top + innerH - (innerH * (v - valueMin)) / Math.max(1e-6, valueMax - valueMin);

  const releaseTime = releaseDate ? new Date(releaseDate).getTime() : null;
  const pre: Array<{ x: number; y: number }> = [];
  const post: Array<{ x: number; y: number }> = [];
  for (const pt of points) {
    const t = toTime(pt.date);
    const cx = xForDate(pt.date);
    const cy = y(pt.value);
    if (releaseTime != null && t >= releaseTime) {
      post.push({ x: cx, y: cy });
    } else {
      pre.push({ x: cx, y: cy });
    }
  }

  const toPath = (arr: Array<{ x: number; y: number }>) => {
    if (arr.length === 0) return '';
    return arr.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(' ');
  };

  const toAreaPath = (arr: Array<{ x: number; y: number }>) => {
    if (arr.length < 2) return '';
    const baseY = padding.top + innerH;
    const line = toPath(arr);
    const last = arr[arr.length - 1];
    return `${line} L ${last.x},${baseY} L ${arr[0].x},${baseY} Z`;
  };

  const releaseX =
    releaseDate && minTime <= maxTime
      ? (() => {
          const rt = new Date(releaseDate).getTime();
          if (rt < minTime) return null;
          // If release is after display end, clamp to right edge so line isn't in empty gap
          const clampedT = rt > maxTime ? maxTime : rt;
          return padding.left + ((clampedT - minTime) / timeRange) * innerW;
        })()
      : null;

  // Bridge gap at release: extend pre to release line, start post from release line (no empty space)
  if (releaseX != null && pre.length > 0 && post.length > 0) {
    pre.push({ x: releaseX, y: pre[pre.length - 1]!.y });
    post.unshift({ x: releaseX, y: post[0]!.y });
  }

  const isPctAxis = displayUnit === '%';

  // X-axis labels: window start, middle, display end (capped to last data to avoid gap)
  const xAxisLabels = [
    { key: windowStart, x: padding.left },
    { key: displayWindowEnd, x: chartWidth - padding.right },
  ];
  const midKey = windowStart < displayWindowEnd ? (() => {
    const start = new Date(windowStart).getTime();
    const end = new Date(displayWindowEnd).getTime();
    const mid = new Date((start + end) / 2);
    return toDateKey(mid);
  })() : windowStart;
  xAxisLabels.splice(1, 0, {
    key: midKey,
    x: padding.left + innerW / 2,
  });

  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={0}>
          <Text size="xs" c="dimmed">
            {category.name}{historyUnit === 'frustration' ? ' · Frustration Signals' : historyUnit === 'completions' ? ' · Completions' : ''} · {window}
          </Text>
          {metric?.measurement_type === 'unique_users_percentage' && (
            <Text size="xs" c="dimmed" style={{ opacity: 0.85 }}>Period-level adoption % (one value for the whole period — flat line matches card)</Text>
          )}
          {isTaskSuccessRateType(metric?.measurement_type ?? '') &&
            (metric?.pendo_event_ids?.length ?? 0) === 1 && (
            <Text size="xs" c="dimmed" style={{ opacity: 0.85 }}>
              Period-level % of users (flat line matches card). Use Pendo dashboard for funnel detail.
            </Text>
          )}
          {(metric?.measurement_type === 'return_rate_7_days' || metric?.measurement_type === 'return_rate_14_days' || metric?.measurement_type === 'return_rate_30_days') && (
            <Text size="xs" c="dimmed" style={{ opacity: 0.85 }}>
              Each point = return rate as of that day (rolling window). 0% = no baseline usage in the first period, so rate could not be computed — not “nobody returned”.
            </Text>
          )}
          {(category.id === 'happiness' || metric?.measurement_type === 'happiness_composite_score') && (
            <Text size="xs" c="dimmed" style={{ opacity: 0.85 }}>Chart: frustration signals. Card: Happiness = inverse (0 frustration = 100).</Text>
          )}
        </Stack>
        <SegmentedControl
          size="xs"
          data={WINDOW_OPTIONS}
          value={window}
          onChange={(v) => setWindow(v as HeartTrackerWindow)}
        />
      </Group>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${chartWidth} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ maxWidth: '100%', display: 'block' }}
      >
        {/* Y-axis unit label (per-user only): show once to avoid overflow on 10K, 100K */}
        {isPerUserAxis && (
          <text
            x={padding.left - 6}
            y={padding.top - 2}
            textAnchor="end"
            dominantBaseline="auto"
            fontSize={9}
            fill="var(--mantine-color-dimmed)"
          >
            /user
          </text>
        )}
        {/* Y grid and labels */}
        {yTickValues.map((v, i) => {
          const yy = y(v);
          const tickLabel = isPctAxis
            ? `${Math.round(v)}%`
            : isPerUserAxis
            ? formatPerUserValue(v)
            : (Math.abs(v) >= 10000
              ? `${(v / 1000).toFixed(0)}K`
              : Math.abs(v) >= 1000
              ? `${(v / 1000).toFixed(1)}K`
              : Number.isInteger(v)
              ? v.toString()
              : v.toFixed(1)) + (isPerUserAxis ? '' : displayUnit);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                x2={chartWidth - padding.right}
                y1={yy}
                y2={yy}
                stroke="var(--mantine-color-default-border)"
                strokeDasharray="2,2"
              />
              <text
                x={padding.left - 6}
                y={yy}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--mantine-color-dimmed)"
              >
                {tickLabel}
              </text>
            </g>
          );
        })}

        {/* X axis: window start, middle, end */}
        {xAxisLabels.map(({ key, x: xx }) => {
          const date = parseDateOnlyLocal(key);
          const isEnd = key === displayWindowEnd;
          return (
            <g key={key}>
              <text
                x={xx}
                y={height - padding.bottom + 16}
                textAnchor={xx === padding.left ? 'start' : xx === chartWidth - padding.right ? 'end' : 'middle'}
                fontSize={10}
                fill="var(--mantine-color-dimmed)"
              >
                {date?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: isEnd ? '2-digit' : undefined }) ?? key}
              </text>
            </g>
          );
        })}

        {/* Filled area (pre = blue tint, post = green tint) */}
        {showFill && (
          <>
            {pre.length >= 2 && (
              <path
                d={toAreaPath(pre)}
                fill="var(--mantine-color-blue-1)"
                stroke="none"
              />
            )}
            {post.length >= 2 && (
              <path
                d={toAreaPath(post)}
                fill="var(--mantine-color-green-1)"
                stroke="none"
              />
            )}
          </>
        )}

        {/* Pre-release line (THEN) */}
        {pre.length >= 2 && (
          <path
            d={toPath(pre)}
            fill="none"
            stroke="var(--mantine-color-blue-5)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {pre.length === 1 && (
          <circle
            cx={pre[0].x}
            cy={pre[0].y}
            r={3}
            fill="var(--mantine-color-blue-5)"
          />
        )}

        {/* Post-release line (NOW) */}
        {post.length >= 2 && (
          <path
            d={toPath(post)}
            fill="none"
            stroke="var(--mantine-color-green-6)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {post.length === 1 && (
          <circle
            cx={post[0].x}
            cy={post[0].y}
            r={3}
            fill="var(--mantine-color-green-6)"
          />
        )}

        {/* Release date vertical line + label */}
        {releaseX != null && releaseX >= padding.left && releaseX <= chartWidth - padding.right && (
          <g>
            <line
              x1={releaseX}
              y1={padding.top}
              x2={releaseX}
              y2={height - padding.bottom}
              stroke="var(--mantine-color-orange-6)"
              strokeWidth={2}
              strokeDasharray="4,4"
            />
            <text
              x={releaseX}
              y={padding.top - 4}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="var(--mantine-color-orange-6)"
            >
              Release
            </text>
          </g>
        )}

        {/* Hover crosshair + tooltip */}
        {hoveredIdx != null && points[hoveredIdx] && (() => {
          const pt = points[hoveredIdx];
          const cx = xForDate(pt.date);
          const cy = y(pt.value);
          const d = new Date(pt.date);
          const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
          const valLabel = isPerUserAxis
            ? formatPerUserValue(pt.value)
            : pt.value >= 10000
            ? `${(pt.value / 1000).toFixed(0)}K`
            : pt.value >= 1000
            ? `${(pt.value / 1000).toFixed(1)}K`
            : Number.isInteger(pt.value) ? pt.value.toLocaleString() : pt.value.toFixed(2);
          const unitSuffix = historyUnit === 'frustration' ? ' frustration signals' : historyUnit === 'completions' ? ' completions' : displayUnit;
          const tooltipText = `${valLabel}${unitSuffix}`;
          const tooltipX = cx > chartWidth / 2 ? cx - 8 : cx + 8;
          const anchor = cx > chartWidth / 2 ? 'end' as const : 'start' as const;
          return (
            <g>
              <line x1={cx} y1={padding.top} x2={cx} y2={height - padding.bottom}
                stroke="var(--mantine-color-dimmed)" strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
              <circle cx={cx} cy={cy} r={4} fill="var(--mantine-color-blue-6)" stroke="#fff" strokeWidth={2} />
              <text x={tooltipX} y={padding.top - 2} textAnchor={anchor}
                fontSize={11} fontWeight={700} fill="var(--mantine-color-text)">
                {tooltipText}
              </text>
              <text x={tooltipX} y={padding.top + 12} textAnchor={anchor}
                fontSize={10} fill="var(--mantine-color-dimmed)">
                {label}
              </text>
            </g>
          );
        })()}

        {/* Invisible hover zones for each data point */}
        {points.map((pt, i) => {
          const cx = xForDate(pt.date);
          const halfGap = points.length > 1
            ? (innerW / (points.length - 1)) / 2
            : innerW / 2;
          return (
            <rect
              key={pt.date}
              x={cx - halfGap}
              y={padding.top}
              width={halfGap * 2}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'crosshair' }}
            />
          );
        })}
      </svg>

      <Group gap="xs" wrap="nowrap">
        <Group gap={4}>
          <span style={{ width: 10, height: 3, backgroundColor: 'var(--mantine-color-blue-5)', display: 'inline-block' }} />
          <Text size="xs" c="dimmed">Pre-release</Text>
        </Group>
        <Group gap={4}>
          <span style={{ width: 10, height: 3, backgroundColor: 'var(--mantine-color-green-6)', display: 'inline-block' }} />
          <Text size="xs" c="dimmed">Post-release</Text>
        </Group>
      </Group>

      {metricContext && (
        <Stack gap={6} mt="sm" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: 8, border: '1px solid var(--mantine-color-default-border)' }}>
          <Text size="xs" fw={600} c="dimmed">Metric details</Text>
          <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
            {metricContext.description}
          </Text>
          {metric?.measurement_type === 'unique_users_percentage' && (
            <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
              Chart and card both show <strong>period-level</strong> adoption % (unique visitors ÷ total visitors in the period). The line is flat because we use one value for the whole period so the chart matches the card.
            </Text>
          )}
          {(metric?.measurement_type === 'return_rate_7_days' || metric?.measurement_type === 'return_rate_14_days' || metric?.measurement_type === 'return_rate_30_days') && (
            <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
              Chart: each point is the return rate <strong>as of that day</strong> (rolling window). Before release, 0% usually means there was no (or negligible) usage in the <strong>first</strong> 30-day window, so the rate could not be computed — it does not mean “nobody returned.”
            </Text>
          )}
          {metricContext.isPageToActionRate && (
            <Text size="xs" c="orange.7" style={{ lineHeight: 1.4 }}>
              First event is a <strong>Page</strong> (page views), so this ratio is <strong>page→action rate</strong> (e.g. link clicks per page view), not a task start→complete funnel. For true task completion rate, use two <strong>Track events</strong> in Edit Metrics (e.g. Started → Completed).
            </Text>
          )}
          {metricContext.usedAppWideFallback && (
            <Text size="xs" c="orange.7">
              Visitor count is app-wide (no data on selected pages).
            </Text>
          )}
          {metricContext.measurementTypeLabel && (
            <Text size="xs" c="dimmed">
              <Text span fw={500}>Measurement type:</Text> {metricContext.measurementTypeLabel}
            </Text>
          )}
          {((metricContext.trackingItems?.length ?? 0) > 0 || metricContext.trackingEvents.length > 0) && (
            <Text size="xs" c="dimmed">
              <Text span fw={500}>Tracking:</Text>{' '}
              {(metricContext.trackingItems?.length ?? 0) > 0
                ? metricContext.trackingItems!.map(({ id, name, type }) => {
                    const typeLabel = type ? ` (${type})` : (name !== id ? ` (${id})` : '');
                    return `${name}${typeLabel}`;
                  }).join(', ')
                : metricContext.trackingEvents.join(', ')}
            </Text>
          )}
          {metricContext.segmentName && (
            <Text size="xs" c="dimmed">
              <Text span fw={500}>Segment:</Text> {metricContext.segmentName}
              <Text span> — metric is limited to visitors in this Pendo segment.</Text>
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}
