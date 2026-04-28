'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconCalendar, IconRotateClockwise, IconSearch } from '@tabler/icons-react';
import { format } from 'date-fns';
import { useRoadmapData } from '@/hooks/useRoadmapData';
import { useAvailableSnapshots } from '@/hooks/useAvailableSnapshots';
import { useHistoricalRoadmapComparison } from '@/hooks/useHistoricalRoadmapComparison';
import { ConfidenceBadge } from '@/components/roadmap/ConfidenceBadge';
import { SlideoutProvider, useSlideout } from '@/components/roadmap/slideout/SlideoutContext';
import { SlideoutContainer } from '@/components/roadmap/slideout/SlideoutContainer';
import { EpicHistoryView } from '@/components/roadmap/slideout/EpicHistoryView';
import type { RoadmapComparison } from '@/types/roadmap';

function fieldLabel(field: string): string {
  const map: Record<string, string> = {
    aha_start_date: 'Start',
    aha_end_date: 'End',
    aha_status: 'Status',
    aha_owner: 'Owner',
    aha_pod: 'Pod',
    aha_t_shirt_est: 'Size',
    aha_release: 'Release',
  };
  return map[field] ?? field;
}

export function RoadmapSnapshotView() {
  return (
    <SlideoutProvider>
      <RoadmapSnapshotInner />
      <SlideoutContainer />
    </SlideoutProvider>
  );
}

function RoadmapSnapshotInner() {
  const { data, isLoading, isError, error, refetch, isFetching } = useRoadmapData();
  const { data: availableSnapshots = [] } = useAvailableSnapshots();
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const { push } = useSlideout();

  const latestSnapshotDate = availableSnapshots[0]?.date ?? null;
  const isHistoricalMode = dateOverride != null && dateOverride !== latestSnapshotDate;
  const { data: historicalComparisons = [], isLoading: historicalLoading } =
    useHistoricalRoadmapComparison(isHistoricalMode ? dateOverride : null);

  const [q, setQ] = useState('');

  const liveComparisons: RoadmapComparison[] = data?.comparisons ?? [];

  const sourceComparisons = isHistoricalMode ? historicalComparisons : liveComparisons;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sourceComparisons;
    return sourceComparisons.filter((c) => {
      const name = (c.latest.aha_name || '').toLowerCase();
      const key = (c.latest.aha_key || '').toLowerCase();
      const rel = (c.latest.aha_release || '').toLowerCase();
      return name.includes(needle) || key.includes(needle) || rel.includes(needle);
    });
  }, [sourceComparisons, q]);

  const showLoader = isLoading || (isHistoricalMode && historicalLoading);

  if (showLoader && sourceComparisons.length === 0) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (isError && !isHistoricalMode) {
    return (
      <Paper p="md" withBorder bg="var(--color-white)">
        <Text c="red" size="sm">
          {error instanceof Error ? error.message : 'Failed to load roadmap snapshot.'}
        </Text>
      </Paper>
    );
  }

  const effectiveDate = isHistoricalMode ? dateOverride : latestSnapshotDate;
  const snapshotLabel = effectiveDate
    ? format(new Date(`${effectiveDate}T12:00:00Z`), 'MMM d, yyyy')
    : data?.maxCreatedAt
      ? new Date(data.maxCreatedAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—';

  return (
    <Stack gap="md" data-table-scope="app">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Group gap="sm" align="center" mb={2}>
            <Title order={3} style={{ color: 'var(--color-gray-900)' }}>
              {isHistoricalMode ? 'Historical snapshot' : "This week's snapshot"}
            </Title>
            {effectiveDate && (
              <Badge
                leftSection={<IconCalendar size={12} />}
                variant="light"
                color="violet"
              >
                {snapshotLabel}
              </Badge>
            )}
            {isHistoricalMode && (
              <Badge color="yellow" variant="light">
                Historical view
              </Badge>
            )}
          </Group>
          <Text size="sm" style={{ color: 'var(--color-gray-600)' }}>
            {isHistoricalMode
              ? `Showing the snapshot as it existed on ${snapshotLabel}. "Changes" column compares to the snapshot immediately before this date.`
              : `Latest ingest: ${snapshotLabel}${isFetching ? ' · Refreshing…' : ''}`}
          </Text>
        </div>
        <Group>
          {availableSnapshots.length > 0 && (
            <Select
              w={200}
              data={availableSnapshots.map((s) => ({ value: s.date, label: s.date }))}
              value={dateOverride ?? latestSnapshotDate}
              onChange={(v) => setDateOverride(v)}
              placeholder="Snapshot date"
            />
          )}
          {isHistoricalMode && (
            <Button
              variant="default"
              size="sm"
              leftSection={<IconRotateClockwise size={16} />}
              onClick={() => setDateOverride(null)}
            >
              Latest
            </Button>
          )}
          <TextInput
            placeholder="Search name, key, or release"
            leftSection={<IconSearch size={16} />}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            w={{ base: '100%', sm: 280 }}
          />
        </Group>
      </Group>

      <Paper withBorder bg="var(--color-white)">
        <Table striped highlightOnHover layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: '30%' }}>Epic</Table.Th>
              <Table.Th style={{ width: '14%' }}>Release</Table.Th>
              <Table.Th style={{ width: '10%' }}>End</Table.Th>
              <Table.Th style={{ width: '12%' }}>Status</Table.Th>
              <Table.Th style={{ width: '12%' }}>Confidence</Table.Th>
              <Table.Th style={{ width: '22%' }}>
                {isHistoricalMode ? 'Changes vs prior snapshot' : 'Changes vs prior week'}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filtered.map(({ latest, changes, previous }) => (
              <Table.Tr
                key={latest.id}
                style={{ cursor: 'pointer' }}
                onClick={() =>
                  push({
                    title: latest.aha_name || latest.aha_key,
                    description: latest.aha_key,
                    render: () => (
                      <EpicHistoryView
                        ahaKey={latest.aha_key}
                        comparison={{ latest, previous, changes }}
                      />
                    ),
                  })
                }
              >
                <Table.Td>
                  <Text size="sm" fw={500} lineClamp={2} style={{ color: 'var(--color-gray-900)' }}>
                    {latest.aha_name || latest.aha_key}
                  </Text>
                  <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
                    {latest.aha_key}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" style={{ color: 'var(--color-gray-800)' }}>
                    {latest.aha_release || '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" style={{ color: 'var(--color-gray-800)' }}>
                    {latest.aha_end_date || '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" lineClamp={2} style={{ color: 'var(--color-gray-800)' }}>
                    {latest.aha_status || '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <ConfidenceBadge
                    ahaKey={latest.aha_key}
                    ahaName={latest.aha_name || latest.aha_key}
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="wrap">
                    {changes.isNew && (
                      <Badge size="sm" variant="light" color="teal">
                        New in snapshot
                      </Badge>
                    )}
                    {changes.changedFields.map((f) => (
                      <Badge key={f} size="sm" variant="outline" color="gray">
                        {fieldLabel(f)}
                      </Badge>
                    ))}
                    {!changes.isNew && changes.changedFields.length === 0 && (
                      <Text size="sm" style={{ color: 'var(--color-gray-500)' }}>
                        —
                      </Text>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {filtered.length === 0 && (
          <Text size="sm" ta="center" py="lg" style={{ color: 'var(--color-gray-500)' }}>
            No rows match your search (or snapshot data is empty).
          </Text>
        )}
      </Paper>

      <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
        <Text
          span
          inherit
          component="button"
          type="button"
          onClick={() => refetch()}
          style={{
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--color-copper)',
            fontWeight: 500,
          }}
        >
          Refresh data
        </Text>
      </Text>
    </Stack>
  );
}
