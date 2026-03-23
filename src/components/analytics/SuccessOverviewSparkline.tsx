"use client";

import React from 'react';

interface SparklinePoint {
  date: string;
  value: number | null;
}

interface SuccessOverviewSparklineProps {
  data: SparklinePoint[];
  width?: number;
  height?: number;
  status?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  ON_TRACK: '#40c057',
  AT_RISK: '#fab005',
  MISSED: '#fa5252',
  PENDING: '#adb5bd',
};

export function SuccessOverviewSparkline({
  data,
  width = 100,
  height = 28,
  status,
}: SuccessOverviewSparklineProps) {
  const color = STATUS_COLORS[status || ''] || '#adb5bd';
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const values = data.map(d => d.value);
  const numeric = values.filter((v): v is number => v !== null);

  // No data → dashed gray line
  if (numeric.length < 2) {
    const midY = height / 2;
    return (
      <svg width={width} height={height} role="img" aria-label="No data">
        <line
          x1={pad}
          y1={midY}
          x2={width - pad}
          y2={midY}
          stroke="#dee2e6"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      </svg>
    );
  }

  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const range = max - min || 1;

  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * innerW;
  const y = (v: number) => pad + innerH - (innerH * (v - min)) / range;

  let d = '';
  values.forEach((v, i) => {
    if (v === null) return;
    const cx = x(i);
    const cy = y(v);
    d += d ? ` L ${cx},${cy}` : `M ${cx},${cy}`;
  });

  return (
    <svg width={width} height={height} role="img" aria-label="Sparkline">
      <path d={d} stroke={color} fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
