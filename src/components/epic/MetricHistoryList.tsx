"use client";

import React, { useState, useEffect } from 'react';
import {
  Table,
  Text,
  Group,
  Badge,
  Paper,
  Select,
  Stack,
  Avatar,
} from '@mantine/core';
import { PurpleLoader } from '../PurpleLoader';
import { UserDisplay } from '../UserDisplay';
import type { EpicSuccessMetricHistory, MetricHistoryChangeType } from '@/lib/success/types';

interface MetricHistoryListProps {
  epicId: string;
  metricId?: string;
}

export function MetricHistoryList({ epicId, metricId }: MetricHistoryListProps) {
  const [history, setHistory] = useState<EpicSuccessMetricHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [changeTypeFilter, setChangeTypeFilter] = useState<MetricHistoryChangeType | 'ALL'>('ALL');

  useEffect(() => {
    fetchHistory();
  }, [epicId, metricId, changeTypeFilter]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (metricId) {
        params.append('metric_id', metricId);
      }
      if (changeTypeFilter !== 'ALL') {
        params.append('change_type', changeTypeFilter);
      }

      const res = await fetch(`/api/epics/${epicId}/success/metrics/history?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch history');
      }

      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching metric history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatChangeType = (changeType: MetricHistoryChangeType): string => {
    switch (changeType) {
      case 'METRIC_ADDED':
        return 'Metric Added';
      case 'METRIC_REMOVED':
        return 'Metric Removed';
      case 'TARGET_SET':
        return 'Target Set';
      case 'TARGET_UPDATED':
        return 'Target Updated';
      case 'EVENT_CONFIG_UPDATED':
        return 'Event Config Updated';
      default:
        return changeType;
    }
  };

  const formatValue = (value: Record<string, any> | null): string => {
    if (!value) return '-';
    
    const parts: string[] = [];
    if (value.target !== undefined && value.target !== null) {
      parts.push(`Target: ${value.target}`);
    }
    if (value.pendo_event_id) {
      parts.push(`Pendo: ${value.pendo_event_id}`);
    }
    if (value.snowflake_query) {
      parts.push(`Snowflake: ${value.snowflake_query.substring(0, 50)}...`);
    }
    if (value.manual_label) {
      parts.push(`Label: ${value.manual_label}`);
    }
    
    return parts.length > 0 ? parts.join(', ') : JSON.stringify(value);
  };

  const getChangeTypeColor = (changeType: MetricHistoryChangeType): string => {
    switch (changeType) {
      case 'METRIC_ADDED':
        return 'green';
      case 'METRIC_REMOVED':
        return 'red';
      case 'TARGET_SET':
      case 'TARGET_UPDATED':
        return 'blue';
      case 'EVENT_CONFIG_UPDATED':
        return 'orange';
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <PurpleLoader size="sm" />
        <Text size="sm" c="dimmed">Loading history...</Text>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <Paper withBorder p="md" radius="md">
        <Text size="sm" c="dimmed">No history available yet.</Text>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text size="lg" fw={600}>Change History</Text>
        <Select
          placeholder="Filter by change type"
          data={[
            { value: 'ALL', label: 'All Changes' },
            { value: 'METRIC_ADDED', label: 'Metric Added' },
            { value: 'METRIC_REMOVED', label: 'Metric Removed' },
            { value: 'TARGET_SET', label: 'Target Set' },
            { value: 'TARGET_UPDATED', label: 'Target Updated' },
            { value: 'EVENT_CONFIG_UPDATED', label: 'Event Config Updated' },
          ]}
          value={changeTypeFilter}
          onChange={(value) => setChangeTypeFilter((value || 'ALL') as MetricHistoryChangeType | 'ALL')}
          style={{ width: 200 }}
        />
      </Group>

      <Paper withBorder p="md" radius="md">
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date/Time</Table.Th>
              <Table.Th>Change Type</Table.Th>
              <Table.Th>Changed By</Table.Th>
              <Table.Th>Previous Value</Table.Th>
              <Table.Th>New Value</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {history.map((entry) => (
              <Table.Tr key={entry.id}>
                <Table.Td>
                  <Text size="sm">
                    {new Date(entry.changed_at).toLocaleString()}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={getChangeTypeColor(entry.change_type)} variant="light">
                    {formatChangeType(entry.change_type)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <UserDisplay
                    email={entry.changed_by.email}
                    firstName={entry.changed_by.first_name}
                    lastName={entry.changed_by.last_name}
                    name={entry.changed_by.email}
                    size="sm"
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {formatValue(entry.old_value)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {formatValue(entry.new_value)}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
