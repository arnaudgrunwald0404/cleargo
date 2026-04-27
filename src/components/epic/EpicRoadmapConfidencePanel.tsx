'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Table, Text, Loader, Stack, Paper, Group, Badge } from '@mantine/core';

type Row = {
  snapshot_date: string;
  final_confidence: string;
  final_percentage: number;
  calculated_confidence: string;
  pm_adjustment: number;
  updated_at: string;
};

export function EpicRoadmapConfidencePanel({ ahaKey }: { ahaKey: string }) {
  const q = useQuery({
    queryKey: ['epic-confidence', ahaKey],
    queryFn: async (): Promise<Row[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('confidence_rating')
        .select(
          'snapshot_date, final_confidence, final_percentage, calculated_confidence, pm_adjustment, updated_at',
        )
        .eq('aha_key', ahaKey)
        .order('snapshot_date', { ascending: false })
        .limit(52);
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
        {q.error instanceof Error ? q.error.message : 'Failed to load confidence history.'}
      </Text>
    );
  }
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No confidence ratings for this epic yet. Ratings are created when the confidence job runs
        for each snapshot.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Confidence by snapshot for {ahaKey} (read-only here; PMs adjust in Roadmap tools when
        enabled).
      </Text>
      <Paper withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Snapshot</Table.Th>
              <Table.Th>Final</Table.Th>
              <Table.Th>%</Table.Th>
              <Table.Th>PM adj.</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.snapshot_date}>
                <Table.Td>
                  <Text size="sm">{r.snapshot_date}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="light">
                    {r.final_confidence}
                  </Badge>
                </Table.Td>
                <Table.Td>{r.final_percentage}</Table.Td>
                <Table.Td>{r.pm_adjustment}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
