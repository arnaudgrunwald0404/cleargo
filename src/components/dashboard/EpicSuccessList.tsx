"use client";

import React from 'react';
import {
  Card,
  Table,
  Badge,
  Group,
  Text,
  Button,
  Select,
  Stack,
  Pagination,
} from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import type { EpicSuccessSummary } from '@/lib/services/successDashboardService';
import type { ScorecardStatus } from '@/lib/success/types';
import { Cohort1DateBadge } from '@/components/Cohort1DateBadge';

interface EpicSuccessListProps {
  epics: EpicSuccessSummary[];
  loading?: boolean;
  onViewEpic?: (epicId: string) => void;
}

export function EpicSuccessList({
  epics,
  loading = false,
  onViewEpic,
}: EpicSuccessListProps) {
  const getStatusColor = (status: ScorecardStatus | null): string => {
    if (!status) return 'gray';
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

  const getStatusLabel = (status: ScorecardStatus | null): string => {
    if (!status) return 'No Scorecard';
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
      <Card withBorder padding="md">
        <Text c="dimmed">Loading epics...</Text>
      </Card>
    );
  }

  if (epics.length === 0) {
    return (
      <Card withBorder padding="md">
        <Text c="dimmed">No epics found with success measurement data.</Text>
      </Card>
    );
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="lg" fw={500}>
            Epics with Success Measurement
          </Text>
          <Text size="sm" c="dimmed">
            {epics.length} epic{epics.length !== 1 ? 's' : ''}
          </Text>
        </Group>

        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Epic</Table.Th>
              <Table.Th>Launch Date</Table.Th>
              <Table.Th>Tier</Table.Th>
              <Table.Th>Scorecard Status</Table.Th>
              <Table.Th>Latest Scorecard</Table.Th>
              <Table.Th>Retros</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {epics.map((epic) => (
              <Table.Tr key={epic.epicId}>
                <Table.Td>
                  <Text fw={500}>{epic.epicName}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    <Cohort1DateBadge
                      epic={{
                        target_launch_date: epic.target_launch_date ?? undefined,
                        aha_fields: epic.aha_fields ?? undefined,
                      }}
                      dateOptions={{ month: 'short', day: 'numeric', year: 'numeric' }}
                      emptyLabel="—"
                    />
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="outline" size="sm">
                    {epic.tier.replace('TIER_', '')}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {epic.latestScorecardStatus ? (
                    <Badge color={getStatusColor(epic.latestScorecardStatus)}>
                      {getStatusLabel(epic.latestScorecardStatus)}
                    </Badge>
                  ) : (
                    <Text size="sm" c="dimmed">No scorecard</Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {epic.latestScorecardDate ? (
                    <Text size="sm">
                      {new Date(epic.latestScorecardDate).toLocaleDateString()}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed">—</Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Badge
                      color={epic.retroCompletion.t30 ? 'green' : 'gray'}
                      size="sm"
                      variant={epic.retroCompletion.t30 ? 'filled' : 'outline'}
                    >
                      T+30
                    </Badge>
                    <Badge
                      color={epic.retroCompletion.t60 ? 'green' : 'gray'}
                      size="sm"
                      variant={epic.retroCompletion.t60 ? 'filled' : 'outline'}
                    >
                      T+60
                    </Badge>
                    <Badge
                      color={epic.retroCompletion.t90 ? 'green' : 'gray'}
                      size="sm"
                      variant={epic.retroCompletion.t90 ? 'filled' : 'outline'}
                    >
                      T+90
                    </Badge>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<IconExternalLink size={14} />}
                    onClick={() => {
                      if (onViewEpic) {
                        onViewEpic(epic.epicId);
                      } else {
                        window.location.href = `/epics/${epic.epicId}`;
                      }
                    }}
                  >
                    View
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Card>
  );
}

