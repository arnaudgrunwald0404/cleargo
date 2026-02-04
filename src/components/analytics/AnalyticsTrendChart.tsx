"use client";

import React from 'react';
import { Text } from '@mantine/core';
import type { TimeSeriesDataPoint } from '@/lib/services/analyticsService';

interface AnalyticsTrendChartProps {
  dataPoints: TimeSeriesDataPoint[];
  metricName: string;
  height?: number;
  valueSuffix?: string;
}

export function AnalyticsTrendChart({
  dataPoints,
  metricName,
  height = 260,
  valueSuffix = '',
}: AnalyticsTrendChartProps) {
  if (!dataPoints || dataPoints.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No trend data available for this period.
      </Text>
    );
  }

  const width = 800;
  const padding = { top: 10, right: 16, bottom: 28, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = dataPoints.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(1e-6, max - min);

  const x = (i: number) =>
    dataPoints.length <= 1
      ? padding.left + innerW / 2
      : padding.left + (i / (dataPoints.length - 1)) * innerW;
  const y = (v: number) =>
    padding.top + innerH - (innerH * (v - min)) / range;

  let pathD = '';
  dataPoints.forEach((p, i) => {
    const cx = x(i);
    const cy = y(p.value);
    pathD += pathD ? ` L ${cx},${cy}` : `M ${cx},${cy}`;
  });

  const yTicks = 4;
  const yTickValues = Array.from(
    { length: yTicks + 1 },
    (_, i) => min + (range * i) / yTicks
  );

  const formatY = (v: number) =>
    Number.isFinite(v) ? `${v.toFixed(v < 10 && v > -1 ? 1 : 0)}${valueSuffix}` : '0';

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`${metricName} trend`}
    >
      {yTickValues.map((t, i) => {
        const yy = y(t);
        return (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yy}
              y2={yy}
              stroke="var(--mantine-color-default-border)"
            />
            <text
              x={padding.left - 6}
              y={yy}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill="var(--mantine-color-dimmed)"
            >
              {formatY(t)}
            </text>
          </g>
        );
      })}

      {dataPoints.map((p, i) => {
        const [yPart, mPart] = p.month.split('-');
        const date = new Date(Number(yPart), Number(mPart) - 1, 1);
        const xx = x(i);
        return (
          <g key={p.month}>
            <line
              x1={xx}
              x2={xx}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="var(--mantine-color-default-border)"
              opacity={0.6}
            />
            <text
              x={xx}
              y={height - padding.bottom + 14}
              textAnchor="middle"
              fontSize={10}
              fill="var(--mantine-color-dimmed)"
            >
              {date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
            </text>
          </g>
        );
      })}

      <path
        d={pathD}
        stroke="var(--mantine-color-violet-6)"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
