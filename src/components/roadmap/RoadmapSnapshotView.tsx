'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useRoadmapData } from '@/hooks/useRoadmapData';

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
  const { data, isLoading, isError, error, refetch, isFetching } = useRoadmapData();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!data?.comparisons) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.comparisons;
    return data.comparisons.filter((c) => {
      const name = (c.latest.aha_name || '').toLowerCase();
      const key = (c.latest.aha_key || '').toLowerCase();
      const rel = (c.latest.aha_release || '').toLowerCase();
      return name.includes(needle) || key.includes(needle) || rel.includes(needle);
    });
  }, [data?.comparisons, q]);

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (isError) {
    return (
      <Paper p="md" withBorder>
        <Text c="red" size="sm">
          {error instanceof Error ? error.message : 'Failed to load roadmap snapshot.'}
        </Text>
      </Paper>
    );
  }

  const snapshotLabel = data?.maxCreatedAt
    ? new Date(data.maxCreatedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={3}>This week&apos;s snapshot</Title>
          <Text size="sm" c="dimmed">
            Latest ingest: {snapshotLabel}
            {isFetching ? ' · Refreshing…' : ''}
          </Text>
        </div>
        <TextInput
          placeholder="Search name, key, or release"
          leftSection={<IconSearch size={16} />}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          w={{ base: '100%', sm: 320 }}
        />
      </Group>

      <Paper withBorder>
        <Table striped highlightOnHover layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: '28%' }}>Epic</Table.Th>
              <Table.Th style={{ width: '14%' }}>Release</Table.Th>
              <Table.Th style={{ width: '10%' }}>End</Table.Th>
              <Table.Th style={{ width: '12%' }}>Status</Table.Th>
              <Table.Th style={{ width: '36%' }}>Changes vs prior week</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filtered.map(({ latest, changes }) => (
              <Table.Tr key={latest.id}>
                <Table.Td>
                  <Text size="sm" fw={500} lineClamp={2}>
                    {latest.aha_name || latest.aha_key}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {latest.aha_key}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{latest.aha_release || '—'}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{latest.aha_end_date || '—'}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" lineClamp={2}>
                    {latest.aha_status || '—'}
                  </Text>
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
                      <Text size="sm" c="dimmed">
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
          <Text size="sm" c="dimmed" ta="center" py="lg">
            No rows match your search (or snapshot data is empty).
          </Text>
        )}
      </Paper>

      <Text size="xs" c="dimmed">
        <Text span inherit component="button" type="button" c="blue" onClick={() => refetch()} style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
          Refresh data
        </Text>
      </Text>
    </Stack>
  );
}
