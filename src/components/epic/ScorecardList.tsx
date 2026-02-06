"use client";

import React from 'react';
import {
  Group,
  Stack,
  Text,
  Badge,
  Button,
  Table,
  Alert,
  Paper,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
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
      <div>
        <Text size="lg" fw={600} c="dark">Success scorecards</Text>
        <Text size="sm" c="dimmed">
          {scorecards.length} scorecard{scorecards.length !== 1 ? 's' : ''} available
        </Text>
      </div>

      {scorecards.length === 0 ? (
        <Alert icon={<IconAlertCircle size={16} />} title="No scorecards" color="yellow">
          No scorecards are available yet. They will appear here once they have been generated.
        </Alert>
      ) : (
        <Paper withBorder radius="md" style={{ border: '1px solid #E5E7EB', backgroundColor: '#FFFFFF', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)' }}>
          <Table style={{ borderCollapse: 'collapse' }}>
            <Table.Thead>
              <Table.Tr style={{ backgroundColor: '#FFFFFF', borderBottom: '2px solid #E5E7EB' }}>
                <Table.Th style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', padding: '12px 16px' }}>Date</Table.Th>
                <Table.Th style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', padding: '12px 16px' }}>Overall status</Table.Th>
                <Table.Th style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', padding: '12px 16px' }}>Metrics tracked</Table.Th>
                <Table.Th style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', padding: '12px 16px' }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody style={{ borderTop: '1px solid #E5E7EB' }}>
              {scorecards.map((scorecard) => (
                <Table.Tr key={scorecard.id} style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}>
                  <Table.Td style={{ padding: '12px 16px' }}>
                    <Text fw={500} size="sm">
                      {new Date(scorecard.snapshot_date).toLocaleDateString()}
                    </Text>
                  </Table.Td>
                  <Table.Td style={{ padding: '12px 16px' }}>
                    <Badge color={getStatusColor(scorecard.overall_status)}>
                      {getStatusLabel(scorecard.overall_status)}
                    </Badge>
                  </Table.Td>
                  <Table.Td style={{ padding: '12px 16px' }}>
                    <Text size="sm">
                      {scorecard.metric_results.length} metric{scorecard.metric_results.length !== 1 ? 's' : ''}
                    </Text>
                  </Table.Td>
                  <Table.Td style={{ padding: '12px 16px' }}>
                    <Button
                      variant="light"
                      size="xs"
                      onClick={() => onSelect(scorecard.snapshot_date)}
                    >
                      View details
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

