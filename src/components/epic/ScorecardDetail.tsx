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
    <Stack gap="md">
      <Card withBorder padding="md">
        <Group justify="space-between" mb="md">
          <div>
            <Text size="lg" fw={500}>
              Scorecard Snapshot
            </Text>
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
                  Mark Reviewed
                </Button>
              </Tooltip>
            )}
            <Badge size="lg" color={getStatusColor(scorecard.overall_status)}>
              {getStatusLabel(scorecard.overall_status)}
            </Badge>
          </Group>
        </Group>
      </Card>

      <Card withBorder padding="md">
        <Text size="md" fw={500} mb="md">
          Metric Results
        </Text>
        {scorecard.metric_results.length === 0 ? (
          <Text size="sm" c="dimmed">
            No metrics configured
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Metric</Table.Th>
                <Table.Th>Actual</Table.Th>
                <Table.Th>Expected</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Source</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {scorecard.metric_results.map((result: MetricResult) => (
                <Table.Tr key={result.metricId}>
                  <Table.Td>
                    <Text fw={500}>{result.metricName}</Text>
                  </Table.Td>
                  <Table.Td>
                    {result.actual === null ? (
                      <Text size="sm" c="dimmed">No data</Text>
                    ) : typeof result.actual === 'boolean' ? (
                      <Text size="sm">{result.actual ? 'Yes' : 'No'}</Text>
                    ) : (
                      <Text size="sm">{result.actual}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {result.expected === null ? (
                      <Text size="sm" c="dimmed">—</Text>
                    ) : (
                      <Text size="sm">{result.expected}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={getStatusColor(result.status)}>
                      {getStatusLabel(result.status)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
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

      <Card withBorder padding="md">
        <Text size="md" fw={500} mb="md">
          Benchmark Comparison
        </Text>
        {scorecard.benchmark_comparison.dataMissing ? (
          <Alert icon={<IconAlertCircle size={16} />} color="yellow">
            Actual activation data is not available yet. This will be populated when data sources are integrated.
          </Alert>
        ) : (
          <Stack gap="md">
            <div>
              <Text size="sm" fw={500} mb="xs">
                Expected vs Actual Activation
              </Text>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Horizon (Days)</Table.Th>
                    <Table.Th>Expected</Table.Th>
                    <Table.Th>Actual</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {scorecard.benchmark_comparison.horizons.map((horizon, index) => {
                    const expected = scorecard.benchmark_comparison.expectedActivation[index];
                    const actual = scorecard.benchmark_comparison.actualActivation?.[index];
                    const isOnTrack = actual !== null && actual !== undefined && actual >= expected * 0.95;
                    const isAtRisk = actual !== null && actual !== undefined && actual >= expected * 0.8 && actual < expected * 0.95;
                    const isMissed = actual !== null && actual !== undefined && actual < expected * 0.8;

                    let status: ScorecardStatus = 'ON_TRACK';
                    if (isMissed) status = 'MISSED';
                    else if (isAtRisk) status = 'AT_RISK';

                    return (
                      <Table.Tr key={horizon}>
                        <Table.Td>{horizon}</Table.Td>
                        <Table.Td>{(expected * 100).toFixed(1)}%</Table.Td>
                        <Table.Td>
                          {actual !== null && actual !== undefined
                            ? `${(actual * 100).toFixed(1)}%`
                            : <Text size="sm" c="dimmed">No data</Text>}
                        </Table.Td>
                        <Table.Td>
                          {actual !== null && actual !== undefined ? (
                            <Badge color={getStatusColor(status)}>
                              {getStatusLabel(status)}
                            </Badge>
                          ) : (
                            <Text size="sm" c="dimmed">—</Text>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </div>
          </Stack>
        )}
      </Card>
    </Stack>
  );
}

