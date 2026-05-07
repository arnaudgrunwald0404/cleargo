'use client';

import { Badge, Group, Paper, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { useSlideout } from './SlideoutContext';
import { EpicHistoryView } from './EpicHistoryView';
import type { PeriodReleaseMovement, RoadmapComparison } from '@/types/roadmap';
import { getDisplayName } from '@/lib/roadmap/displayNames';

interface PeriodMovementsViewProps {
  rows: PeriodReleaseMovement[];
  /** Lookup so clicking a row can drill into the epic's full history. */
  comparisons?: RoadmapComparison[];
  /** AI blurbs keyed by `aha_key` (same snapshot as comparisons). */
  descriptions?: Record<string, string>;
}

const IMPACT_COLOR: Record<string, string> = {
  high: 'red',
  medium: 'yellow',
  low: 'gray',
  positive: 'teal',
};

export function PeriodMovementsView({ rows, comparisons, descriptions }: PeriodMovementsViewProps) {
  const { push } = useSlideout();

  if (rows.length === 0) {
    return (
      <Text size="sm" ta="center" py="md" style={{ color: 'var(--color-gray-500)' }}>
        No detailed movements for this selection.
      </Text>
    );
  }

  const compByKey = new Map<string, RoadmapComparison>();
  comparisons?.forEach((c) => compByKey.set(c.latest.aha_key, c));

  return (
    <Stack gap="sm" data-table-scope="app">
      <Text size="sm" style={{ color: 'var(--color-gray-600)' }}>
        {rows.length} epic{rows.length === 1 ? '' : 's'} moved release. Click any row to see its
        full history.
      </Text>
      <Paper withBorder bg="var(--color-white)">
        <Table striped highlightOnHover layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: '46%' }}>Epic</Table.Th>
              <Table.Th style={{ width: '17%' }}>From</Table.Th>
              <Table.Th style={{ width: '17%' }}>To</Table.Th>
              <Table.Th style={{ width: '20%' }}>Impact</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => {
              const comparison = compByKey.get(r.aha_key);
              const displayTitle = getDisplayName({
                gtm_name: r.gtm_name ?? '',
                aha_name: r.aha_name,
                aha_key: r.aha_key,
              });
              return (
                <Table.Tr
                  key={`${r.aha_key}-${r.week_start}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    push({
                      title: displayTitle || r.aha_key,
                      description: r.aha_key,
                      render: () => (
                        <EpicHistoryView
                          ahaKey={r.aha_key}
                          comparison={comparison}
                          aiSummary={descriptions?.[r.aha_key]}
                        />
                      ),
                    })
                  }
                >
                  <Table.Td>
                    <UnstyledButton component="span" style={{ display: 'block' }}>
                      <Text
                        size="sm"
                        fw={500}
                        lineClamp={2}
                        style={{ color: 'var(--color-gray-900)' }}
                      >
                        {displayTitle}
                      </Text>
                      <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
                        {r.aha_key}
                      </Text>
                    </UnstyledButton>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" style={{ color: 'var(--color-gray-800)' }}>
                      {r.from_release ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" style={{ color: 'var(--color-gray-800)' }}>
                      {r.to_release ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="wrap">
                      <Badge
                        size="sm"
                        variant="light"
                        color={IMPACT_COLOR[r.impact_level ?? ''] ?? 'gray'}
                      >
                        {r.impact_level ?? '—'}
                      </Badge>
                      {r.is_overridden && (
                        <Badge size="xs" variant="outline" color="violet">
                          PM
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
