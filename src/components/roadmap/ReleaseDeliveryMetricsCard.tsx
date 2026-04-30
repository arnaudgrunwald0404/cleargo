'use client';

import { Badge, Group, Loader, Paper, Progress, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconCheck, IconClock, IconAlertTriangle } from '@tabler/icons-react';
import { useReleaseDeliveryMetrics } from '@/hooks/useReleaseDeliveryMetrics';

/**
 * Most-recent past release: planned vs delivered, on-time/late breakdown.
 * Mirrors RRV's `ReleaseDeliveryMetrics` "Last Release" card.
 */
export function ReleaseDeliveryMetricsCard() {
  const { data, isLoading, isError } = useReleaseDeliveryMetrics(null);
  const row = data?.[0];

  return (
    <Paper withBorder bg="var(--color-white)" p="md">
      <Group justify="space-between" align="flex-start" mb="xs">
        <div>
          <Text fw={600} size="sm" style={{ color: 'var(--color-gray-900)' }}>
            Release delivery
          </Text>
          <Text size="xs" style={{ color: 'var(--color-gray-600)' }}>
            Most recent past release · planned vs delivered
          </Text>
        </div>
        {row?.release_name && (
          <Badge color="violet" variant="light" size="sm">
            {row.release_name}
          </Badge>
        )}
      </Group>

      {isLoading ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : isError || !row ? (
        <Text size="sm" style={{ color: 'var(--color-gray-500)' }} ta="center" py="md">
          No completed release found yet.
        </Text>
      ) : (
        <Stack gap="sm" mt="xs">
          <Group justify="space-between" align="baseline">
            <Text size="sm" style={{ color: 'var(--color-gray-700)' }}>
              Commitment
            </Text>
            <Text fw={700} size="lg" style={{ color: 'var(--color-gray-900)' }}>
              {Math.round(row.commitment_percentage)}%
              <Text span size="xs" ml={6} style={{ color: 'var(--color-gray-500)' }}>
                ({row.total_delivered} of {row.total_planned})
              </Text>
            </Text>
          </Group>
          <Progress
            value={row.commitment_percentage}
            color="green"
            radius="sm"
            size="md"
          />

          <SimpleGrid cols={3} spacing="xs" mt={4}>
            <DeliveryStat
              icon={<IconCheck size={14} />}
              label="On time"
              value={row.delivered_on_time}
              pct={row.on_time_percentage}
              color="var(--color-success-base)"
            />
            <DeliveryStat
              icon={<IconClock size={14} />}
              label="1 release late"
              value={row.delivered_one_late}
              pct={row.one_late_percentage}
              color="var(--color-warning-base)"
            />
            <DeliveryStat
              icon={<IconAlertTriangle size={14} />}
              label="2+ late"
              value={row.delivered_two_plus_late}
              pct={row.two_plus_late_percentage}
              color="var(--color-error-base)"
            />
          </SimpleGrid>

          {row.items_in_progress > 0 && (
            <Text size="xs" mt="xs" style={{ color: 'var(--color-gray-500)' }}>
              {row.items_in_progress} epic{row.items_in_progress === 1 ? '' : 's'} still in
              progress (on track: {row.in_progress_on_time}, slipping:{' '}
              {row.in_progress_one_late + row.in_progress_two_plus_late}).
            </Text>
          )}
        </Stack>
      )}
    </Paper>
  );
}

interface DeliveryStatProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  pct: number;
  color: string;
}

function DeliveryStat({ icon, label, value, pct, color }: DeliveryStatProps) {
  return (
    <div>
      <Group gap={4} mb={2} wrap="nowrap">
        <span style={{ color }}>{icon}</span>
        <Text size="xs" style={{ color: 'var(--color-gray-600)' }}>
          {label}
        </Text>
      </Group>
      <Text fw={700} size="md" style={{ color }}>
        {value}
        <Text span size="xs" ml={4} style={{ color: 'var(--color-gray-500)', fontWeight: 400 }}>
          {Math.round(pct)}%
        </Text>
      </Text>
    </div>
  );
}
