"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Group, Stack, Text, Badge, Loader, Tooltip } from '@mantine/core';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import type { EpicScorecard } from '@/lib/success/types';

interface Props {
  epicId: string;
}

interface EpicSummary {
  id: string;
  target_launch_date: string | null;
  status: string;
}

// Lightweight inline SVG line chart for 2–5 numeric metrics
function LineChart({
  width,
  height,
  series,
  dates,
}: {
  width: number;
  height: number;
  series: Array<{ key: string; color: string; values: Array<number | null> }>;
  dates: string[];
}) {
  const padding = { top: 10, right: 16, bottom: 24, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = series.flatMap(s => s.values.filter((v): v is number => v !== null));
  const min = allValues.length ? Math.min(...allValues) : 0;
  const max = allValues.length ? Math.max(...allValues) : 1;
  const x = (i: number) => padding.left + (i / Math.max(1, dates.length - 1)) * innerW;
  const y = (v: number) => padding.top + innerH - (innerH * (v - min)) / Math.max(1e-6, max - min);

  const mkPath = (vals: Array<number | null>) => {
    let d = '';
    vals.forEach((v, i) => {
      if (v === null) return;
      const cx = x(i);
      const cy = y(v);
      d += d ? ` L ${cx},${cy}` : `M ${cx},${cy}`;
    });
    return d;
  };

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);

  return (
    <svg width={width} height={height} role="img" aria-label="Success metrics time series">
      {/* Y grid */}
      {yTicks.map((t, i) => {
        const yy = y(t);
        return (
          <g key={i}>
            <line x1={padding.left} x2={width - padding.right} y1={yy} y2={yy} stroke="#eee" />
            <text x={padding.left - 6} y={yy} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#666">
              {Number.isFinite(t) ? t.toFixed(0) : '0'}
            </text>
          </g>
        );
      })}

      {/* X axis (month ticks) */}
      {dates.map((d, i) => {
        const date = new Date(d);
        const isFirstOfMonth = date.getDate() === 1 || i === 0 || i === dates.length - 1;
        if (!isFirstOfMonth) return null;
        const xx = x(i);
        return (
          <g key={d}>
            <line x1={xx} x2={xx} y1={padding.top} y2={height - padding.bottom} stroke="#f5f5f5" />
            <text x={xx} y={height - padding.bottom + 14} textAnchor="middle" fontSize={10} fill="#666">
              {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          </g>
        );
      })}

      {/* Series */}
      {series.map(s => (
        <path key={s.key} d={mkPath(s.values)} stroke={s.color} fill="none" strokeWidth={1.75} />
      ))}
    </svg>
  );
}

export function ScorecardTimeSeries({ epicId }: Props) {
  const [epic, setEpic] = useState<EpicSummary | null>(null);
  const [scorecards, setScorecards] = useState<EpicScorecard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [epicRes, scRes] = await Promise.all([
          fetchWithRateLimit(`/api/epics/${epicId}`, { maxRetries: 1 }),
          fetchWithRateLimit(`/api/epics/${epicId}/success/scorecards?limit=365`, { maxRetries: 1 }),
        ]);
        if (!epicRes.ok) throw new Error('Failed to load epic');
        const epicData = await epicRes.json();
        if (!scRes.ok) throw new Error('Failed to load scorecards');
        const scData = await scRes.json();
        if (!mounted) return;
        setEpic({ id: epicData.id, target_launch_date: epicData.target_launch_date, status: epicData.status });
        setScorecards(Array.isArray(scData) ? scData : []);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [epicId]);

  const { dates, series } = useMemo(() => {
    const result = { dates: [] as string[], series: [] as Array<{ key: string; color: string; values: Array<number | null> }> };
    if (!epic?.target_launch_date) return result;

    const launch = new Date(epic.target_launch_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Window: -90 days to +120 days, but cap end at today
    const start = new Date(launch);
    start.setDate(start.getDate() - 90);
    start.setHours(0, 0, 0, 0);

    const end = new Date(Math.min(launch.getTime() + 120 * 86400000, today.getTime()));

    // build date array inclusive
    const cursor = new Date(start);
    const dateStrings: string[] = [];
    while (cursor <= end) {
      dateStrings.push(cursor.toISOString().split('T')[0]);
      cursor.setDate(cursor.getDate() + 1);
    }

    // Determine numeric metrics from the most recent scorecard
    const latest = scorecards[0];
    const numericMetricNames = new Set<string>();
    if (latest) {
      for (const r of latest.metric_results) {
        if (typeof r.actual === 'number') numericMetricNames.add(r.metricName);
      }
    }

    // Assign palette
    const palette = ['#1c7ed6', '#12b886', '#fab005', '#fa5252', '#7950f2'];

    const seriesArr = Array.from(numericMetricNames).slice(0, 5).map((name, idx) => ({
      key: name,
      color: palette[idx % palette.length],
      values: dateStrings.map((d) => {
        const sc = scorecards.find(s => s.snapshot_date === d);
        if (!sc) return null;
        const metric = sc.metric_results.find(m => m.metricName === name);
        return metric && typeof metric.actual === 'number' ? (metric.actual as number) : null;
        
      }),
    }));

    return { dates: dateStrings, series: seriesArr };
  }, [epic?.target_launch_date, scorecards]);

  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="sm">
        <div>
          <Text size="md" fw={500}>Trends (Launch → +180d)</Text>
          <Text size="sm" c="dimmed">
            {epic?.target_launch_date ? `${new Date(epic.target_launch_date).toLocaleDateString()} → ${dates.length ? new Date(dates[dates.length - 1]).toLocaleDateString() : ''}` : 'No launch date set'}
          </Text>
        </div>
        {loading && <Loader size="sm" />}
      </Group>

      {series.length === 0 ? (
        <Text size="sm" c="dimmed">No numeric metric data available yet.</Text>
      ) : (
        <Stack gap="xs">
          <LineChart width={800} height={260} series={series} dates={dates} />
          <Group gap="xs" wrap="wrap">
            {series.map(s => (
              <Badge key={s.key} color="gray" variant="light" leftSection={<span style={{ width: 10, height: 2, background: s.color, display: 'inline-block' }} />}>{s.key}</Badge>
            ))}
          </Group>
          <Text size="xs" c="dimmed">Only numeric metrics are plotted. Values are shown for days with a generated scorecard.</Text>
        </Stack>
      )}
    </Card>
  );
}