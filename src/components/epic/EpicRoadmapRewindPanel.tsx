'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Table, Text, Loader, Stack, Paper, Group } from '@mantine/core';

type Row = {
  snapshot_date: string;
  aha_release: string | null;
  aha_end_date: string | null;
  aha_status: string | null;
};

export function EpicRoadmapRewindPanel({ ahaKey }: { ahaKey: string }) {
  const q = useQuery({
    queryKey: ['epic-roadmap-snapshots', ahaKey],
    queryFn: async (): Promise<Row[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('roadmap_snapshot')
        .select('snapshot_date, aha_release, aha_end_date, aha_status')
        .eq('aha_key', ahaKey)
        .order('snapshot_date', { ascending: false })
        .limit(104);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (q.isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }
  if (q.isError) {
    return (
      <Text size="sm" c="red">
        {q.error instanceof Error ? q.error.message : 'Failed to load snapshot history.'}
      </Text>
    );
  }
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No weekly roadmap snapshots for this epic yet. Snapshots are populated by the Roadmap
        Snapshot job.
      </Text>
    );
  }
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Recent weekly pivot rows for this Aha key ({ahaKey}), newest first.
      </Text>
      <Paper withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Snapshot</Table.Th>
              <Table.Th>Release</Table.Th>
              <Table.Th>End</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.snapshot_date}>
                <Table.Td>
                  <Text size="sm">{r.snapshot_date}</Text>
                </Table.Td>
                <Table.Td>{r.aha_release ?? '—'}</Table.Td>
                <Table.Td>{r.aha_end_date ?? '—'}</Table.Td>
                <Table.Td>{r.aha_status ?? '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
