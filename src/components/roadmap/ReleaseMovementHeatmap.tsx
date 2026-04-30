'use client';

import { useMemo, useState } from 'react';
import {
  addWeeks,
  eachWeekOfInterval,
  format,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { Loader, Text, Tooltip, Group, Box } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { PeriodReleaseMovement } from '@/types/roadmap';
import type { RoadmapImpactLevel } from '@/types/roadmap';

type ImpactLevel = RoadmapImpactLevel;

export interface ReleaseMovementHeatmapProps {
  actualMovements: PeriodReleaseMovement[];
  onWeekClick: (weekStart: string, weekEnd: string, items: string[]) => void;
  asOfDate?: string | null;
  isLoading?: boolean;
}

interface WeekData {
  weekStart: string;
  weekEnd: string;
  isPast: boolean;
  highImpact: { count: number; items: string[] };
  positiveImpact: { count: number; items: string[] };
  mediumImpact: { count: number; items: string[] };
  lowImpact: { count: number; items: string[] };
}

function parseLocalDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getColorClass(count: number, impactLevel: ImpactLevel) {
  if (count === 0) return 'bg-slate-100 hover:bg-slate-200';
  if (impactLevel === 'high') {
    if (count <= 2) return 'bg-red-100 hover:bg-red-200';
    if (count <= 5) return 'bg-red-300 hover:bg-red-400';
    return 'bg-red-500 hover:bg-red-600';
  }
  if (impactLevel === 'positive') {
    if (count <= 2) return 'bg-emerald-100 hover:bg-emerald-200';
    if (count <= 5) return 'bg-emerald-300 hover:bg-emerald-400';
    return 'bg-emerald-500 hover:bg-emerald-600';
  }
  if (impactLevel === 'medium') {
    if (count <= 2) return 'bg-amber-200 hover:bg-amber-300';
    if (count <= 5) return 'bg-amber-400 hover:bg-amber-500';
    return 'bg-amber-600 hover:bg-amber-700';
  }
  if (count <= 2) return 'bg-blue-100 hover:bg-blue-200';
  if (count <= 5) return 'bg-blue-300 hover:bg-blue-400';
  return 'bg-blue-500 hover:bg-blue-600';
}

function getImpactDescription(impactLevel: ImpactLevel): string {
  switch (impactLevel) {
    case 'high':
      return 'Items with CSM Priority';
    case 'positive':
      return 'Items accelerated into one of the next 3 imminent releases (earlier target date).';
    case 'medium':
      return 'Items delayed or moved between near-term and upcoming releases.';
    case 'low':
      return 'Other release movements (e.g. between far-future releases).';
    default:
      return '';
  }
}

export function ReleaseMovementHeatmap({
  actualMovements,
  onWeekClick,
  asOfDate,
  isLoading,
}: ReleaseMovementHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const effectiveDate = asOfDate ? parseLocalDate(asOfDate) : new Date();

  const weekImpactMap = useMemo(() => {
    const map = new Map<string, { high: string[]; positive: string[]; medium: string[]; low: string[] }>();
    actualMovements.forEach((m) => {
      const ws = m.week_start?.split('T')[0] ?? m.week_start;
      if (!map.has(ws)) {
        map.set(ws, { high: [], positive: [], medium: [], low: [] });
      }
      const weekData = map.get(ws)!;
      const level = (m.impact_level || 'low') as ImpactLevel;
      weekData[level].push(m.aha_key);
    });
    return map;
  }, [actualMovements]);

  const weeks = useMemo(() => {
    const yearStart = startOfYear(effectiveDate);
    const yearEnd = new Date(effectiveDate.getFullYear(), 11, 31);
    const startDate = startOfWeek(yearStart, { weekStartsOn: 1 });
    const endDate = startOfWeek(yearEnd, { weekStartsOn: 1 });
    const weekIntervals = eachWeekOfInterval(
      { start: startDate, end: endDate },
      { weekStartsOn: 1 },
    );
    return weekIntervals.map((weekStartDate) => {
      const weekStartStr = format(weekStartDate, 'yyyy-MM-dd');
      const weekEndStr = format(addWeeks(weekStartDate, 1), 'yyyy-MM-dd');
      const impactData = weekImpactMap.get(weekStartStr) || {
        high: [],
        positive: [],
        medium: [],
        low: [],
      };
      return {
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        isPast: weekStartDate <= effectiveDate,
        highImpact: { count: impactData.high.length, items: impactData.high },
        positiveImpact: { count: impactData.positive.length, items: impactData.positive },
        mediumImpact: { count: impactData.medium.length, items: impactData.medium },
        lowImpact: { count: impactData.low.length, items: impactData.low },
      } satisfies WeekData;
    });
  }, [weekImpactMap, effectiveDate]);

  const monthLabels = useMemo(() => {
    const labels: { month: string; position: number }[] = [];
    const displayYear = effectiveDate.getFullYear();
    const seenMonths = new Set<string>();
    weeks.forEach((week, index) => {
      const weekDate = new Date(week.weekStart);
      const weekEnd = new Date(week.weekEnd);
      const midWeek = new Date((weekDate.getTime() + weekEnd.getTime()) / 2);
      const month = format(midWeek, 'MMM');
      const year = midWeek.getFullYear();
      const monthKey = `${year}-${month}`;
      if (year === displayYear && !seenMonths.has(monthKey)) {
        labels.push({ month, position: index });
        seenMonths.add(monthKey);
      }
    });
    return labels;
  }, [weeks, effectiveDate]);

  if (isLoading) {
    return (
      <div className="space-y-3 w-full">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            Weekly release movement history
          </Text>
          <Group gap="xs">
            <Loader size="sm" />
            <Text size="xs" c="dimmed">
              Loading…
            </Text>
          </Group>
        </Group>
      </div>
    );
  }

  const renderImpactRow = (impactLevel: ImpactLevel, label: string) => (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs font-medium text-gray-500 flex-shrink-0 flex items-center gap-1">
        <span>{label}</span>
        <Tooltip label={getImpactDescription(impactLevel)} withArrow multiline w={280}>
          <span className="inline-flex cursor-help">
            <IconInfoCircle size={14} className="text-gray-400" />
          </span>
        </Tooltip>
      </div>
      <div className="grid gap-1 flex-1" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week) => {
          const impactData = week[`${impactLevel}Impact` as keyof WeekData] as {
            count: number;
            items: string[];
          };
          const count = impactData.count;
          const items = impactData.items;
          const cellId = `${week.weekStart}-${impactLevel}`;
          const isHovered = hoveredCell === cellId;
          return (
            <Tooltip
              key={cellId}
              label={
                <div>
                  <Text size="xs" fw={500}>
                    Week of {format(parseLocalDate(week.weekStart), 'MMM dd')} — {label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {count === 0 ? 'No movements' : `${count} movement${count !== 1 ? 's' : ''}`}
                  </Text>
                </div>
              }
            >
              <button
                type="button"
                onClick={() => {
                  if (count > 0) {
                    onWeekClick(week.weekStart, week.weekEnd, items);
                  }
                }}
                onMouseEnter={() => setHoveredCell(cellId)}
                onMouseLeave={() => setHoveredCell(null)}
                className={`
                  aspect-square w-full rounded transition-all duration-150 border
                  ${getColorClass(count, impactLevel)}
                  ${count > 0 ? 'cursor-pointer border-transparent' : 'cursor-default border-slate-200'}
                  ${isHovered && count > 0 ? 'ring-2 ring-offset-1' : ''}
                  ${isHovered && impactLevel === 'high' ? 'ring-red-400' : ''}
                  ${isHovered && impactLevel === 'positive' ? 'ring-green-400' : ''}
                  ${isHovered && impactLevel === 'medium' ? 'ring-amber-400' : ''}
                  ${isHovered && impactLevel === 'low' ? 'ring-blue-400' : ''}
                  ${!week.isPast ? 'opacity-30' : ''}
                `}
                disabled={!week.isPast || count === 0}
                aria-label={`Week of ${format(parseLocalDate(week.weekStart), 'MMM dd')}, ${label}: ${count} movements`}
              />
            </Tooltip>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 w-full min-w-0">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text size="sm" fw={600} style={{ color: 'var(--color-gray-900)' }}>
          Weekly release movement history
        </Text>
        <Group gap="md" wrap="wrap">
          <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
            Intensity = # of movements
          </Text>
          <LegendSwatch label="High" colors={['#fee2e2', '#fca5a5', '#ef4444']} />
          <LegendSwatch label="Positive" colors={['#d1fae5', '#6ee7b7', '#10b981']} />
          <LegendSwatch label="Medium" colors={['#fde68a', '#fbbf24', '#d97706']} />
          <LegendSwatch label="Low" colors={['#dbeafe', '#93c5fd', '#3b82f6']} />
        </Group>
      </Group>

      <div className="relative mb-1" style={{ height: 18, marginLeft: '7.25rem' }}>
        {monthLabels.map(({ month, position }) => (
          <div
            key={`${month}-${position}`}
            style={{ left: `${(position / weeks.length) * 100}%` }}
            className="absolute text-xs text-gray-500"
          >
            {month}
          </div>
        ))}
      </div>

      <Box className="space-y-1 overflow-x-auto">
        {renderImpactRow('high', 'High Impact')}
        {renderImpactRow('positive', 'Positive Impact')}
        {renderImpactRow('medium', 'Medium Impact')}
        {renderImpactRow('low', 'Low Impact')}
      </Box>
    </div>
  );
}

interface LegendSwatchProps {
  label: string;
  colors: [string, string, string];
}

function LegendSwatch({ label, colors }: LegendSwatchProps) {
  return (
    <Group gap={4} align="center" wrap="nowrap">
      <Group gap={2} wrap="nowrap">
        {colors.map((c) => (
          <div
            key={c}
            style={{
              width: 8,
              height: 12,
              background: c,
              borderRadius: 2,
            }}
          />
        ))}
      </Group>
      <Text size="xs" style={{ color: 'var(--color-gray-600)' }}>
        {label}
      </Text>
    </Group>
  );
}
