"use client";

import React from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Badge,
  Button,
  Table,
  Alert,
} from '@mantine/core';
import { IconPlus, IconAlertCircle } from '@tabler/icons-react';
import type { EpicScorecard, ScorecardStatus } from '@/lib/success/types';

interface ScorecardListProps {
  epicId: string;
  scorecards: EpicScorecard[];
  onSelect: (date: string) => void;
}

export function ScorecardList({
  epicId,
  scorecards,
  onSelect,
}: ScorecardListProps) {
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

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text size="lg" fw={500}>
            Success Scorecards
          </Text>
          <Text size="sm" c="dimmed">
            {scorecards.length} scorecard{scorecards.length !== 1 ? 's' : ''} available
          </Text>
        </div>
      </Group>

      {scorecards.length === 0 ? (
        <Alert icon={<IconAlertCircle size={16} />} title="No Scorecards" color="yellow">
          No scorecards are available yet. They will appear here once they have been generated.
        </Alert>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Overall Status</Table.Th>
              <Table.Th>Metrics Tracked</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {scorecards.map((scorecard) => (
              <Table.Tr key={scorecard.id}>
                <Table.Td>
                  <Text fw={500}>
                    {new Date(scorecard.snapshot_date).toLocaleDateString()}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={getStatusColor(scorecard.overall_status)}>
                    {getStatusLabel(scorecard.overall_status)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {scorecard.metric_results.length} metric{scorecard.metric_results.length !== 1 ? 's' : ''}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => onSelect(scorecard.snapshot_date)}
                  >
                    View Details
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

