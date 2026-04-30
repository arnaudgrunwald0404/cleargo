'use client';

import { Group, Loader, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { usePriorityGoalsDeliveryMetrics } from '@/hooks/usePriorityGoalsDeliveryMetrics';

/**
 * Priority + goals delivery summary across last release / QTD / YTD.
 * Mirrors RRV's `PriorityAndGoalsMetrics` panel.
 */
export function PriorityGoalsMetricsCard({ asOfDate }: { asOfDate?: string | null }) {
  const { data, isLoading, isError } = usePriorityGoalsDeliveryMetrics(asOfDate);

  return (
    <Paper withBorder bg="var(--color-white)" p="md">
      <div style={{ marginBottom: 8 }}>
        <Text fw={600} size="sm" style={{ color: 'var(--color-gray-900)' }}>
          Priority &amp; goals delivered
        </Text>
        <Text size="xs" style={{ color: 'var(--color-gray-600)' }}>
          CSM-priority and goal-linked epics shipped over time
        </Text>
      </div>

      {isLoading ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : isError || !data ? (
        <Text size="sm" style={{ color: 'var(--color-gray-500)' }} ta="center" py="md">
          No priority/goal metrics available yet.
        </Text>
      ) : (
        <Stack gap="md">
          <PeriodRow
            label={data.last_release_name ? `Last release · ${data.last_release_name}` : 'Last release'}
            sublabel={data.last_release_date ?? undefined}
            priorityDelivered={data.last_release_csm_priority_delivered}
            priorityTotal={data.last_release_csm_priority_total}
            goalsDelivered={data.last_release_with_goals_delivered}
            goalsTotal={data.last_release_with_goals_total}
            combinedDelivered={data.last_release_combined_delivered}
            combinedTotal={data.last_release_combined_total}
          />
          <PeriodRow
            label="Quarter-to-date"
            sublabel={data.quarter_start ?? undefined}
            priorityDelivered={data.qtd_csm_priority_delivered}
            priorityTotal={data.qtd_csm_priority_total}
            goalsDelivered={data.qtd_with_goals_delivered}
            goalsTotal={data.qtd_with_goals_total}
            combinedDelivered={data.qtd_combined_delivered}
            combinedTotal={data.qtd_combined_total}
          />
          <PeriodRow
            label="Year-to-date"
            sublabel={data.year_start ?? undefined}
            priorityDelivered={data.ytd_csm_priority_delivered}
            priorityTotal={data.ytd_csm_priority_total}
            goalsDelivered={data.ytd_with_goals_delivered}
            goalsTotal={data.ytd_with_goals_total}
            combinedDelivered={data.ytd_combined_delivered}
            combinedTotal={data.ytd_combined_total}
          />
        </Stack>
      )}
    </Paper>
  );
}

interface PeriodRowProps {
  label: string;
  sublabel?: string;
  priorityDelivered: number;
  priorityTotal: number;
  goalsDelivered: number;
  goalsTotal: number;
  combinedDelivered: number;
  combinedTotal: number;
}

function PeriodRow({
  label,
  sublabel,
  priorityDelivered,
  priorityTotal,
  goalsDelivered,
  goalsTotal,
  combinedDelivered,
  combinedTotal,
}: PeriodRowProps) {
  const combinedPct =
    combinedTotal > 0 ? Math.round((combinedDelivered / combinedTotal) * 100) : 0;
  return (
    <div>
      <Group justify="space-between" align="baseline" mb={4} wrap="wrap">
        <div>
          <Text size="sm" fw={500} style={{ color: 'var(--color-gray-900)' }}>
            {label}
          </Text>
          {sublabel && (
            <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
              since {sublabel}
            </Text>
          )}
        </div>
        <Tooltip
          label={`${combinedDelivered} of ${combinedTotal} priority/goal-linked epics shipped`}
          openDelay={300}
          withArrow
        >
          <Text fw={700} size="lg" style={{ color: 'var(--color-gray-900)' }}>
            {combinedDelivered}
            <Text span size="sm" style={{ color: 'var(--color-gray-500)' }}>
              {' / '}
              {combinedTotal}
            </Text>
            <Text span size="xs" ml={6} style={{ color: 'var(--color-gray-500)' }}>
              ({combinedPct}%)
            </Text>
          </Text>
        </Tooltip>
      </Group>
      <Group gap="xl" wrap="wrap">
        <Stat
          label="CSM priority"
          delivered={priorityDelivered}
          total={priorityTotal}
          color="var(--color-info-base)"
        />
        <Stat
          label="With goals"
          delivered={goalsDelivered}
          total={goalsTotal}
          color="var(--color-success-base)"
        />
      </Group>
    </div>
  );
}

function Stat({
  label,
  delivered,
  total,
  color,
}: {
  label: string;
  delivered: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;
  return (
    <div>
      <Text size="xs" style={{ color: 'var(--color-gray-600)' }}>
        {label}
      </Text>
      <Text size="sm" fw={600} style={{ color }}>
        {delivered}
        <Text span size="xs" ml={4} style={{ color: 'var(--color-gray-500)', fontWeight: 400 }}>
          / {total} ({pct}%)
        </Text>
      </Text>
    </div>
  );
}
