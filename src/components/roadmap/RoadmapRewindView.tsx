'use client';

import { useMemo, useState } from 'react';
import {
  Group,
  Title,
  Text,
  Paper,
  SimpleGrid,
  Select,
  Button,
  Modal,
  Table,
  Badge,
  Stack,
  Loader,
  Box,
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
import { ReleaseMovementHeatmap } from '@/components/roadmap/ReleaseMovementHeatmap';
import type { PeriodReleaseMovement, WeeklyMovement } from '@/types/roadmap';

function normWeek(s: string) {
  return s?.split('T')[0] ?? s;
}

export function RoadmapRewindView() {
  const { data: availableSnapshots = [], isLoading: snapshotsLoading } = useAvailableSnapshots();
  /** When null, the latest snapshot in the list is used (no effect needed). */
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const selectedDate = dateOverride ?? availableSnapshots[0]?.date ?? null;

  const isViewingLatest =
    availableSnapshots.length > 0 && selectedDate === availableSnapshots[0].date;

  const { data: yearlyMovements = [], isLoading: yLoading } = useYearlyMovements(selectedDate);
  const { data: impactCategorized = [], isLoading: impactLoading } =
    useImpactCategorizedMovements(selectedDate);

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

  const [modal, setModal] = useState<{
    title: string;
    rows: PeriodReleaseMovement[];
  } | null>(null);

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
      <Text c="dimmed" size="sm">
        No roadmap snapshots yet. After the weekly snapshot job runs, movement analytics will
        appear here.
      </Text>
    );
  }

  return (
    <>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Group gap="sm" align="center" mb={4}>
              <Title order={3}>Release movement trends</Title>
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
            </Group>
            <Text size="sm" c="dimmed">
              How work shifted between releases over time (same metrics as RRV Performance Insights,
              without visit tracking or AI).
            </Text>
          </div>
          <Group>
            <Select
              w={220}
              data={availableSnapshots.map((s) => ({ value: s.date, label: s.date }))}
              value={selectedDate}
              onChange={(v) => setDateOverride(v)}
              disabled={snapshotsLoading}
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

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Paper
            p="md"
            withBorder
            style={{ cursor: 'pointer' }}
            onClick={() =>
              setModal({ title: 'This week — release movements', rows: weeklyPeriodMovements })
            }
          >
            <Text size="sm" c="dimmed" mb={4}>
              This week
            </Text>
            <Text fz={28} fw={700} c="amber.7">
              {actualWeekCount}
            </Text>
            <Text size="xs" c="dimmed">
              {mostRecentWeek
                ? `Week of ${format(new Date(mostRecentWeek.weekStart), 'MMM d')}`
                : '—'}
            </Text>
          </Paper>
          <Paper
            p="md"
            withBorder
            style={{ cursor: 'pointer' }}
            onClick={() =>
              setModal({
                title: 'Quarter-to-date — release movements',
                rows: quarterlyPeriodMovements,
              })
            }
          >
            <Text size="sm" c="dimmed" mb={4}>
              Quarter-to-date
            </Text>
            <Text fz={28} fw={700} c="blue.7">
              {actualQuarterCount}
            </Text>
            <Text size="xs" c="dimmed">
              {format(quarterStart, 'MMM d')} – {format(now, 'MMM d')}
            </Text>
          </Paper>
          <Paper
            p="md"
            withBorder
            style={{ cursor: 'pointer' }}
            onClick={() =>
              setModal({ title: 'Year-to-date — release movements', rows: ytdPeriodMovements })
            }
          >
            <Text size="sm" c="dimmed" mb={4}>
              Year-to-date
            </Text>
            <Text fz={28} fw={700} c="violet.7">
              {actualYtdCount}
            </Text>
            <Text size="xs" c="dimmed">
              {format(yearStart, 'yyyy')}
            </Text>
          </Paper>
        </SimpleGrid>

        <Paper p="md" withBorder>
          <Text fw={600} size="sm" mb="md">
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

        <Paper p="md" withBorder>
          {impactLoading ? (
            <Group>
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Loading heatmap…
              </Text>
            </Group>
          ) : (
            <ReleaseMovementHeatmap
              actualMovements={periodMovements}
              onWeekClick={(weekStart) => {
                const rowForWeek = periodMovements.filter((m) => normWeek(m.week_start) === weekStart);
                setModal({
                  title: `Week of ${format(new Date(weekStart), 'MMM d, yyyy')}`,
                  rows: rowForWeek,
                });
              }}
              asOfDate={selectedDate}
              isLoading={false}
            />
          )}
        </Paper>
      </Stack>

      <Modal opened={!!modal} onClose={() => setModal(null)} title={modal?.title} size="lg">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Epic</Table.Th>
              <Table.Th>From</Table.Th>
              <Table.Th>To</Table.Th>
              <Table.Th>Impact</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(modal?.rows ?? []).map((r) => (
              <Table.Tr key={`${r.aha_key}-${r.week_start}`}>
                <Table.Td>
                  <Text size="sm" fw={500} lineClamp={1}>
                    {r.aha_name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {r.aha_key}
                  </Text>
                </Table.Td>
                <Table.Td>{r.from_release ?? '—'}</Table.Td>
                <Table.Td>{r.to_release ?? '—'}</Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="light" color="gray">
                    {r.impact_level ?? '—'}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {(modal?.rows?.length ?? 0) === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No detailed movements for this selection.
          </Text>
        )}
      </Modal>
    </>
  );
}
