"use client";

import React, { useState, useEffect } from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Badge,
  Table,
  Select,
  Alert,
  Progress,
  Button,
  Tooltip,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh, IconCheck } from '@tabler/icons-react';
import { PurpleLoader } from '../PurpleLoader';
import { notifications } from '@mantine/notifications';
import type { EpicScorecard, MetricResult, ScorecardStatus } from '@/lib/success/types';

interface ScorecardDetailProps {
  epicId: string;
  scorecard: EpicScorecard | null;
  loading?: boolean;
  onRefresh?: () => Promise<void>;
  isAdmin?: boolean;
  isPM?: boolean;
}

export function ScorecardDetail({
  epicId,
  scorecard,
  loading = false,
  onRefresh,
  isAdmin = false,
  isPM = false,
}: ScorecardDetailProps) {
  const [markingReviewed, setMarkingReviewed] = useState(false);

  const handleMarkReviewed = async () => {
    if (!epicId) return;
    setMarkingReviewed(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/success/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to mark as reviewed');
      }

      notifications.show({
        title: 'Marked as reviewed',
        message: 'This scorecard has been marked as reviewed.',
        color: 'green',
      });
    } catch (error: any) {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to mark as reviewed',
        color: 'red',
      });
    } finally {
      setMarkingReviewed(false);
    }
  };

  const canMarkReviewed = (isAdmin || isPM) && !markingReviewed;
  const getStatusColor = (status: ScorecardStatus): string => {
    switch (status) {
      case 'ON_TRACK':
        return 'green';
      case 'AT_RISK':
        return 'yellow';
      case 'MISSED':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusLabel = (status: ScorecardStatus): string => {
    switch (status) {
      case 'ON_TRACK':
        return 'On Track';
      case 'AT_RISK':
        return 'At Risk';
      case 'MISSED':
        return 'Missed';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <PurpleLoader />
      </div>
    );
  }

  if (!scorecard) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="No Scorecard" color="yellow">
        No scorecard found for the selected date.
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <Card withBorder padding="md" radius="md" bg="white" style={{ borderColor: '#E5E7EB' }}>
        <Group justify="space-between" mb="md">
          <div>
            <Text size="lg" fw={600} c="dark">Scorecard</Text>
            <Text size="sm" c="dimmed">
              {new Date(scorecard.snapshot_date).toLocaleDateString()}
            </Text>
          </div>
          <Group gap="xs">
            {onRefresh && (
              <Tooltip label="Refresh data from sources">
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconRefresh size={14} />}
                  onClick={onRefresh}
                >
                  Refresh
                </Button>
              </Tooltip>
            )}
            {canMarkReviewed && (
              <Tooltip label="Mark this scorecard as reviewed">
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconCheck size={14} />}
                  onClick={handleMarkReviewed}
                  loading={markingReviewed}
                >
                  Mark reviewed
                </Button>
              </Tooltip>
            )}
            <Badge size="lg" color={getStatusColor(scorecard.overall_status)}>
              {getStatusLabel(scorecard.overall_status)}
            </Badge>
          </Group>
        </Group>
      </Card>

      <Card withBorder padding="md" radius="md" bg="white" style={{ borderColor: '#E5E7EB' }}>
        <Text size="md" fw={600} c="dark" mb="md">Metric results</Text>
        {scorecard.metric_results.length === 0 ? (
          <Text size="sm" c="dimmed">
            No metrics configured
          </Text>
        ) : (
          <Table style={{ borderCollapse: 'collapse' }}>
            <Table.Thead>
              <Table.Tr style={{ backgroundColor: '#FFFFFF', borderBottom: '2px solid #E5E7EB' }}>
                <Table.Th style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', padding: '12px 16px' }}>Metric</Table.Th>
                <Table.Th style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', padding: '12px 16px' }}>Actual</Table.Th>
                <Table.Th style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', padding: '12px 16px' }}>Expected</Table.Th>
                <Table.Th style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', padding: '12px 16px' }}>Status</Table.Th>
                <Table.Th style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', padding: '12px 16px' }}>Source</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody style={{ borderTop: '1px solid #E5E7EB' }}>
              {scorecard.metric_results.map((result: MetricResult) => (
                <Table.Tr key={result.metricId} style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}>
                  <Table.Td style={{ padding: '12px 16px' }}>
                    <Text fw={500} size="sm">{result.metricName}</Text>
                  </Table.Td>
                  <Table.Td style={{ padding: '12px 16px' }}>
                    {result.actual === null ? (
                      <Text size="sm" c="dimmed">No data</Text>
                    ) : typeof result.actual === 'boolean' ? (
                      <Text size="sm">{result.actual ? 'Yes' : 'No'}</Text>
                    ) : (
                      <Text size="sm">{result.actual}</Text>
                    )}
                  </Table.Td>
                  <Table.Td style={{ padding: '12px 16px' }}>
                    {result.expected === null ? (
                      <Text size="sm" c="dimmed">—</Text>
                    ) : (
                      <Text size="sm">{result.expected}</Text>
                    )}
                  </Table.Td>
                  <Table.Td style={{ padding: '12px 16px' }}>
                    <Badge color={getStatusColor(result.status)}>
                      {getStatusLabel(result.status)}
                    </Badge>
                  </Table.Td>
                  <Table.Td style={{ padding: '12px 16px' }}>
                    <Tooltip label={`Data source: ${result.source}`}>
                      <Badge
                        variant="outline"
                        size="sm"
                        color={
                          result.source === 'PENDO'
                            ? 'blue'
                            : result.source === 'SNOWFLAKE'
                            ? 'cyan'
                            : 'gray'
                        }
                      >
                        {result.source}
                      </Badge>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}

