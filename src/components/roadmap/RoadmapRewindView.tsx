'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconCalendar, IconRotateClockwise } from '@tabler/icons-react';
import { format, startOfQuarter, startOfYear } from 'date-fns';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAvailableSnapshots } from '@/hooks/useAvailableSnapshots';
import { useYearlyMovements } from '@/hooks/useYearlyMovements';
import { useImpactCategorizedMovements } from '@/hooks/useImpactCategorizedMovements';
import { usePeriodReleaseMovements } from '@/hooks/usePeriodReleaseMovements';
import { useRoadmapData } from '@/hooks/useRoadmapData';
import { ReleaseMovementHeatmap } from '@/components/roadmap/ReleaseMovementHeatmap';
import { ReleaseDeliveryMetricsCard } from '@/components/roadmap/ReleaseDeliveryMetricsCard';
import { PriorityGoalsMetricsCard } from '@/components/roadmap/PriorityGoalsMetricsCard';
import { GoalBreakdownCard } from '@/components/roadmap/GoalBreakdownCard';
import { SlideoutProvider, useSlideout } from '@/components/roadmap/slideout/SlideoutContext';
import { SlideoutContainer } from '@/components/roadmap/slideout/SlideoutContainer';
import { PeriodMovementsView } from '@/components/roadmap/slideout/PeriodMovementsView';
import { VisitStatsButton } from '@/components/roadmap/VisitStatsButton';
import { useTrackRoadmapVisit } from '@/hooks/useRoadmapVisits';
import type { PeriodReleaseMovement, WeeklyMovement } from '@/types/roadmap';

function normWeek(s: string) {
  return s?.split('T')[0] ?? s;
}

export function RoadmapRewindView() {
  return (
    <SlideoutProvider>
      <RoadmapRewindInner />
      <SlideoutContainer />
    </SlideoutProvider>
  );
}

function RoadmapRewindInner() {
  const { data: availableSnapshots = [], isLoading: snapshotsLoading } = useAvailableSnapshots();
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const selectedDate = dateOverride ?? availableSnapshots[0]?.date ?? null;

  const isViewingLatest =
    availableSnapshots.length > 0 && selectedDate === availableSnapshots[0].date;

  // Record a visit only when viewing the latest snapshot — scrubbing
  // through history shouldn't inflate counts on old snapshot dates.
  useTrackRoadmapVisit(
    isViewingLatest ? selectedDate : null,
    'rewind',
    isViewingLatest,
  );

  const { data: yearlyMovements = [], isLoading: yLoading } = useYearlyMovements(selectedDate);
  const { data: impactCategorized = [], isLoading: impactLoading } =
    useImpactCategorizedMovements(selectedDate);

  // Used to enrich slideout drilldowns with `previous` snapshot diffs.
  const { data: roadmapData } = useRoadmapData();

  const { push } = useSlideout();

  const periodMovements: PeriodReleaseMovement[] = useMemo(
    () =>
      impactCategorized.map((m) => ({
        aha_key: m.aha_key,
        aha_name: m.aha_name,
        from_release: m.from_release,
        to_release: m.to_release,
        week_start: normWeek(String(m.week_start)),
        aha_csm_priority: m.aha_csm_priority,
        impact_level: m.impact_level,
        calculated_impact_level: m.calculated_impact_level,
        is_overridden: m.is_overridden,
      })),
    [impactCategorized],
  );

  const effectiveDate = selectedDate ? new Date(`${selectedDate}T12:00:00Z`) : new Date();
  const now = effectiveDate;
  const quarterStart = startOfQuarter(effectiveDate);
  const yearStart = startOfYear(effectiveDate);

  const mostRecentWeek = useMemo(() => {
    const sorted = [...yearlyMovements].sort(
      (a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime(),
    );
    return sorted[0];
  }, [yearlyMovements]);

  const weekMovementsData = useMemo(
    () => (mostRecentWeek ? [mostRecentWeek] : []),
    [mostRecentWeek],
  );
  const quarterMovements = useMemo(
    () =>
      yearlyMovements.filter((m) => {
        const weekEnd = new Date(m.weekEnd);
        return weekEnd >= quarterStart;
      }),
    [yearlyMovements, quarterStart],
  );
  const yearMovements = useMemo(
    () =>
      yearlyMovements.filter((m) => {
        const weekEnd = new Date(m.weekEnd);
        return weekEnd >= yearStart;
      }),
    [yearlyMovements, yearStart],
  );

  const weekSummary = useMemo(
    () => ({
      snapshotDate: format(now, 'yyyy-MM-dd'),
      baselineDate: mostRecentWeek ? mostRecentWeek.weekStart : format(now, 'yyyy-MM-dd'),
      totalMovements: mostRecentWeek ? mostRecentWeek.count : 0,
      weeks: weekMovementsData,
    }),
    [now, mostRecentWeek, weekMovementsData],
  );
  const quarterSummary = useMemo(
    () => ({
      snapshotDate: format(now, 'yyyy-MM-dd'),
      baselineDate: format(quarterStart, 'yyyy-MM-dd'),
      totalMovements: quarterMovements.reduce((s, m) => s + m.count, 0),
      weeks: quarterMovements,
    }),
    [now, quarterStart, quarterMovements],
  );
  const ytdSummary = useMemo(
    () => ({
      snapshotDate: format(now, 'yyyy-MM-dd'),
      baselineDate: format(yearStart, 'yyyy-MM-dd'),
      totalMovements: yearMovements.reduce((s, m) => s + m.count, 0),
      weeks: yearMovements,
    }),
    [now, yearStart, yearMovements],
  );

  const { data: weeklyPeriodMovements = [] } = usePeriodReleaseMovements(
    weekSummary.weeks as WeeklyMovement[],
    selectedDate,
  );
  const { data: quarterlyPeriodMovements = [] } = usePeriodReleaseMovements(
    quarterSummary.weeks as WeeklyMovement[],
    selectedDate,
  );
  const { data: ytdPeriodMovements = [] } = usePeriodReleaseMovements(
    ytdSummary.weeks as WeeklyMovement[],
    selectedDate,
  );

  const actualWeekCount = weeklyPeriodMovements.length || weekSummary.totalMovements;
  const actualQuarterCount = quarterlyPeriodMovements.length || quarterSummary.totalMovements;
  const actualYtdCount = ytdPeriodMovements.length || ytdSummary.totalMovements;

  const totalEpicsTracked = roadmapData?.comparisons.length ?? 0;
  const stableCount = useMemo(
    () =>
      (roadmapData?.comparisons ?? []).filter(
        (c) => !c.changes.isNew && c.changes.changedFields.length === 0,
      ).length,
    [roadmapData?.comparisons],
  );
  const stablePct =
    totalEpicsTracked > 0 ? Math.round((stableCount / totalEpicsTracked) * 100) : 0;

  const chartData = useMemo(
    () =>
      [...yearlyMovements]
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
        .map((w) => ({
          label: format(new Date(w.weekStart), 'MMM d'),
          count: w.count,
        })),
    [yearlyMovements],
  );

  const showLoader = snapshotsLoading || (yLoading && yearlyMovements.length === 0);

  if (showLoader && !availableSnapshots.length) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (!availableSnapshots.length) {
    return (
      <Text size="sm" style={{ color: 'var(--color-gray-700)' }}>
        No roadmap snapshots yet. After the weekly snapshot job runs, movement analytics will
        appear here.
      </Text>
    );
  }

  const openPeriod = (title: string, rows: PeriodReleaseMovement[]) =>
    push({
      title,
      description: `${rows.length} epic${rows.length === 1 ? '' : 's'}`,
      render: () => (
        <PeriodMovementsView rows={rows} comparisons={roadmapData?.comparisons} />
      ),
    });

  return (
    <Stack gap="lg" data-table-scope="app">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Group gap="sm" align="center" mb={4}>
            <Title order={3} style={{ color: 'var(--color-gray-900)' }}>
              Release movement trends
            </Title>
            {selectedDate && (
              <Badge
                leftSection={<IconCalendar size={12} />}
                variant="light"
                color="violet"
              >
                {format(new Date(`${selectedDate}T12:00:00Z`), 'MMM d, yyyy')}
              </Badge>
            )}
            {!isViewingLatest && (
              <Badge color="yellow" variant="light">
                Historical view
              </Badge>
            )}
            <VisitStatsButton snapshotDate={selectedDate} page="rewind" />
          </Group>
          <Text size="sm" style={{ color: 'var(--color-gray-600)' }}>
            How work shifted between releases over time (same metrics as RRV Performance Insights).
            Click any tile or heatmap cell to drill in.
          </Text>
        </div>
        <Group>
          <Select
            w={220}
            size="sm"
            data={availableSnapshots.map((s) => ({ value: s.date, label: s.date }))}
            value={selectedDate}
            onChange={(v) => setDateOverride(v)}
            disabled={snapshotsLoading}
            placeholder="Snapshot date"
            leftSection={<IconCalendar size={14} />}
            styles={{
              input: { color: 'var(--color-gray-900)', fontWeight: 500 },
            }}
          />
          {!isViewingLatest && (
            <Button
              variant="default"
              size="sm"
              leftSection={<IconRotateClockwise size={16} />}
              onClick={() => {
                if (availableSnapshots[0]) setDateOverride(availableSnapshots[0].date);
              }}
            >
              Latest
            </Button>
          )}
        </Group>
      </Group>

      {/* Summary stats row */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <SummaryTile label="Epics tracked" value={totalEpicsTracked} accent="cast-iron" />
        <SummaryTile
          label="Stable this week"
          value={stableCount}
          extra={`${stablePct}%`}
          accent="green"
        />
        <SummaryTile label="Moved this week" value={actualWeekCount} accent="amber" />
        <SummaryTile label="Moved YTD" value={actualYtdCount} accent="violet" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <KPICard
          label="This week"
          value={actualWeekCount}
          color="var(--color-warning-base)"
          subtitle={
            mostRecentWeek
              ? `Week of ${format(new Date(mostRecentWeek.weekStart), 'MMM d')}`
              : '—'
          }
          onClick={() =>
            openPeriod('This week — release movements', weeklyPeriodMovements)
          }
        />
        <KPICard
          label="Quarter-to-date"
          value={actualQuarterCount}
          color="var(--color-info-base)"
          subtitle={`${format(quarterStart, 'MMM d')} – ${format(now, 'MMM d')}`}
          onClick={() =>
            openPeriod('Quarter-to-date — release movements', quarterlyPeriodMovements)
          }
        />
        <KPICard
          label="Year-to-date"
          value={actualYtdCount}
          color="var(--mantine-color-violet-7)"
          subtitle={format(yearStart, 'yyyy')}
          onClick={() => openPeriod('Year-to-date — release movements', ytdPeriodMovements)}
        />
      </SimpleGrid>

      <Paper p="md" withBorder bg="var(--color-white)">
        <Text fw={600} size="sm" mb="md" style={{ color: 'var(--color-gray-900)' }}>
          Movements per week ({now.getFullYear()})
        </Text>
        <Box h={220}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10 }} />
              <RechartsTooltip />
              <Bar dataKey="count" fill="var(--mantine-color-violet-5)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      <Paper p="md" withBorder bg="var(--color-white)">
        {impactLoading ? (
          <Group>
            <Loader size="sm" />
            <Text size="sm" style={{ color: 'var(--color-gray-600)' }}>
              Loading heatmap…
            </Text>
          </Group>
        ) : (
          <ReleaseMovementHeatmap
            actualMovements={periodMovements}
            onWeekClick={(weekStart) => {
              const rowsForWeek = periodMovements.filter(
                (m) => normWeek(m.week_start) === weekStart,
              );
              openPeriod(`Week of ${format(new Date(weekStart), 'MMM d, yyyy')}`, rowsForWeek);
            }}
            asOfDate={selectedDate}
            isLoading={false}
          />
        )}
      </Paper>

      {/* Delivery / priority panels */}
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <ReleaseDeliveryMetricsCard />
        <PriorityGoalsMetricsCard asOfDate={selectedDate} />
      </SimpleGrid>

      {/* Goal breakdown — top strategic goals, with item counts and bars */}
      <GoalBreakdownCard comparisons={roadmapData?.comparisons} />
    </Stack>
  );
}

interface KPICardProps {
  label: string;
  value: number;
  subtitle: string;
  color: string;
  onClick: () => void;
}

function KPICard({ label, value, subtitle, color, onClick }: KPICardProps) {
  return (
    <Paper
      p="md"
      withBorder
      bg="var(--color-white)"
      style={{ cursor: 'pointer' }}
      onClick={onClick}
    >
      <Text size="sm" mb={4} style={{ color: 'var(--color-gray-600)' }}>
        {label}
      </Text>
      <Text fz={28} fw={700} style={{ color }}>
        {value}
      </Text>
      <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
        {subtitle}
      </Text>
    </Paper>
  );
}

interface SummaryTileProps {
  label: string;
  value: number;
  extra?: string;
  accent: 'cast-iron' | 'amber' | 'violet' | 'green';
}

function SummaryTile({ label, value, extra, accent }: SummaryTileProps) {
  const valueColor =
    accent === 'amber'
      ? 'var(--color-warning-base)'
      : accent === 'violet'
        ? 'var(--mantine-color-violet-7)'
        : accent === 'green'
          ? 'var(--color-success-base)'
          : 'var(--color-gray-900)';
  return (
    <Paper p="sm" withBorder bg="var(--color-white)">
      <Text size="xs" style={{ color: 'var(--color-gray-600)' }}>
        {label}
      </Text>
      <Group gap={6} align="baseline">
        <Text fz={22} fw={700} style={{ color: valueColor }}>
          {value}
        </Text>
        {extra && (
          <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
            {extra}
          </Text>
        )}
      </Group>
    </Paper>
  );
}
