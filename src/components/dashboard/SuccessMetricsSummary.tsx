"use client";

import React from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Badge,
  Progress,
  Grid,
  Divider,
} from '@mantine/core';
import type { SuccessMetricsSummary as SummaryType } from '@/lib/services/successDashboardService';

interface SuccessMetricsSummaryProps {
  summary: SummaryType;
  loading?: boolean;
}

export function SuccessMetricsSummary({
  summary,
  loading = false,
}: SuccessMetricsSummaryProps) {
  if (loading) {
    return (
      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder padding="md">
            <Text size="sm" c="dimmed">Loading...</Text>
          </Card>
        </Grid.Col>
      </Grid>
    );
  }

  const total = summary.epicsByStatus.onTrack + summary.epicsByStatus.atRisk + summary.epicsByStatus.missed;
  const onTrackPercentage = total > 0 ? (summary.epicsByStatus.onTrack / total) * 100 : 0;

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Card withBorder padding="md">
          <Stack gap="xs">
            <Text size="sm" c="dimmed" fw={500}>
              Total Epics Tracked
            </Text>
            <Text size="xl" fw={700}>
              {summary.totalEpicsTracked}
            </Text>
          </Stack>
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 8 }}>
        <Card withBorder padding="md">
          <Stack gap="md">
            <div>
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={500}>
                  Scorecard Status Distribution
                </Text>
                <Text size="xs" c="dimmed">
                  {total} epics with scorecards
                </Text>
              </Group>
              <Stack gap="xs">
                <div>
                  <Group justify="space-between" mb={4}>
                    <Text size="sm">On Track</Text>
                    <Text size="sm" fw={500}>{summary.epicsByStatus.onTrack}</Text>
                  </Group>
                  <Progress
                    value={(summary.epicsByStatus.onTrack / total) * 100}
                    color="green"
                    size="lg"
                    radius="md"
                  />
                </div>
                <div>
                  <Group justify="space-between" mb={4}>
                    <Text size="sm">At Risk</Text>
                    <Text size="sm" fw={500}>{summary.epicsByStatus.atRisk}</Text>
                  </Group>
                  <Progress
                    value={(summary.epicsByStatus.atRisk / total) * 100}
                    color="yellow"
                    size="lg"
                    radius="md"
                  />
                </div>
                <div>
                  <Group justify="space-between" mb={4}>
                    <Text size="sm">Missed</Text>
                    <Text size="sm" fw={500}>{summary.epicsByStatus.missed}</Text>
                  </Group>
                  <Progress
                    value={(summary.epicsByStatus.missed / total) * 100}
                    color="red"
                    size="lg"
                    radius="md"
                  />
                </div>
              </Stack>
              <Group gap="md" mt="xs">
                <Badge color="green" variant="light">
                  {summary.epicsByStatus.onTrack} On Track
                </Badge>
                <Badge color="yellow" variant="light">
                  {summary.epicsByStatus.atRisk} At Risk
                </Badge>
                <Badge color="red" variant="light">
                  {summary.epicsByStatus.missed} Missed
                </Badge>
              </Group>
            </div>
          </Stack>
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 4 }}>
        <Card withBorder padding="md">
          <Stack gap="xs">
            <Text size="sm" c="dimmed" fw={500}>
              T+30 Retro Completion
            </Text>
            <Text size="xl" fw={700}>
              {Math.round(summary.retroCompletionRates.t30.rate * 100)}%
            </Text>
            <Text size="xs" c="dimmed">
              {summary.retroCompletionRates.t30.completed} of {summary.retroCompletionRates.t30.total}
            </Text>
          </Stack>
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 4 }}>
        <Card withBorder padding="md">
          <Stack gap="xs">
            <Text size="sm" c="dimmed" fw={500}>
              T+60 Retro Completion
            </Text>
            <Text size="xl" fw={700}>
              {Math.round(summary.retroCompletionRates.t60.rate * 100)}%
            </Text>
            <Text size="xs" c="dimmed">
              {summary.retroCompletionRates.t60.completed} of {summary.retroCompletionRates.t60.total}
            </Text>
          </Stack>
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 4 }}>
        <Card withBorder padding="md">
          <Stack gap="xs">
            <Text size="sm" c="dimmed" fw={500}>
              T+90 Retro Completion
            </Text>
            <Text size="xl" fw={700}>
              {Math.round(summary.retroCompletionRates.t90.rate * 100)}%
            </Text>
            <Text size="xs" c="dimmed">
              {summary.retroCompletionRates.t90.completed} of {summary.retroCompletionRates.t90.total}
            </Text>
          </Stack>
        </Card>
      </Grid.Col>
    </Grid>
  );
}

