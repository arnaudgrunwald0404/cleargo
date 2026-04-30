'use client';

import { useMemo } from 'react';
import { Badge, Group, Paper, Progress, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { useRoadmapData } from '@/hooks/useRoadmapData';
import { useSlideout } from '@/components/roadmap/slideout/SlideoutContext';
import { PeriodMovementsView } from '@/components/roadmap/slideout/PeriodMovementsView';
import type { PeriodReleaseMovement, RoadmapComparison } from '@/types/roadmap';

/**
 * Strip basic HTML and split a comma- or list-separated `aha_primary_goal`
 * value into individual goal strings.
 */
function parseGoals(html: string | null | undefined): string[] {
  if (!html) return [];
  const cleaned = html
    .replace(/<\/li>/gi, '|')
    .replace(/<[^>]+>/g, '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  if (cleaned.length > 0) return cleaned;
  return [html.trim()].filter(Boolean);
}

interface GoalBreakdownCardProps {
  /** Optional override — if not provided, uses live `useRoadmapData()`. */
  comparisons?: RoadmapComparison[];
  /** How many top goals to show (default 5). */
  limit?: number;
}

/**
 * Top-N goal breakdown card — counts how many in-snapshot epics are
 * aligned to each strategic goal and renders horizontal bars sorted by
 * count. Mirrors the "Goal Breakdown" panel from RRV's Performance
 * Insights page. Click a row to drill into the list of contributing
 * epics in the standard slideout.
 */
export function GoalBreakdownCard({ comparisons, limit = 5 }: GoalBreakdownCardProps) {
  const { data } = useRoadmapData();
  const { push } = useSlideout();

  const sourceComparisons = comparisons ?? data?.comparisons ?? [];

  const { topGoals, totalItems, totalGoals } = useMemo(() => {
    const counts = new Map<string, RoadmapComparison[]>();
    sourceComparisons.forEach((c) => {
      const goals = parseGoals(c.latest.aha_primary_goal);
      goals.forEach((g) => {
        const list = counts.get(g) ?? [];
        list.push(c);
        counts.set(g, list);
      });
    });
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, limit);
    return {
      topGoals: sorted,
      totalItems: sourceComparisons.length,
      totalGoals: counts.size,
    };
  }, [sourceComparisons, limit]);

  if (totalItems === 0) return null;

  return (
    <Paper p="md" withBorder bg="var(--color-white)">
      <Group justify="space-between" mb="md">
        <Group gap={8}>
          <IconChartBar size={16} color="var(--color-success-base)" />
          <Text fw={600} size="sm" style={{ color: 'var(--color-gray-900)' }}>
            Goal breakdown
          </Text>
        </Group>
        <Badge size="xs" variant="light" color="gray">
          Top {topGoals.length} {totalGoals > topGoals.length ? `of ${totalGoals}` : 'goals'}
        </Badge>
      </Group>

      {topGoals.length === 0 ? (
        <Text size="sm" style={{ color: 'var(--color-gray-500)' }}>
          No goal data on the current snapshot.
        </Text>
      ) : (
        <Stack gap="sm">
          {topGoals.map(([goal, items]) => {
            const count = items.length;
            const pct = totalItems > 0 ? (count / totalItems) * 100 : 0;
            return (
              <UnstyledButton
                key={goal}
                onClick={() => {
                  // Synthesize a "movements" payload so we can reuse the
                  // existing PeriodMovementsView slideout for drilldowns.
                  const rows: PeriodReleaseMovement[] = items.map((c) => ({
                    aha_key: c.latest.aha_key,
                    aha_name: c.latest.aha_name,
                    from_release: c.previous?.aha_release || null,
                    to_release: c.latest.aha_release || null,
                    week_start: '',
                    aha_csm_priority: c.latest.aha_csm_priority,
                  }));
                  push({
                    title: goal,
                    description: `${count} epic${count === 1 ? '' : 's'} aligned to this goal`,
                    render: () => (
                      <PeriodMovementsView rows={rows} comparisons={sourceComparisons} />
                    ),
                  });
                }}
                style={{
                  padding: '6px 8px',
                  borderRadius: 6,
                  transition: 'background 0.1s',
                }}
                styles={{
                  root: {
                    '&:hover': { background: 'var(--color-gray-50)' },
                  },
                }}
              >
                <Group justify="space-between" mb={4} wrap="nowrap">
                  <Text
                    size="xs"
                    fw={500}
                    lineClamp={1}
                    style={{ color: 'var(--color-gray-800)', flex: 1 }}
                  >
                    {goal}
                  </Text>
                  <Text size="xs" style={{ color: 'var(--color-gray-500)', flexShrink: 0 }}>
                    {count} item{count === 1 ? '' : 's'} ({pct.toFixed(1)}%)
                  </Text>
                </Group>
                <Progress value={pct} color="teal" size="sm" radius="xl" />
              </UnstyledButton>
            );
          })}
        </Stack>
      )}

      {totalGoals > topGoals.length && (
        <Text size="xs" mt="sm" style={{ color: 'var(--color-gray-500)' }}>
          + {totalGoals - topGoals.length} more goal
          {totalGoals - topGoals.length !== 1 ? 's' : ''} not shown
        </Text>
      )}
    </Paper>
  );
}
