"use client";

import React, { useState } from 'react';
import {
  Button,
  Group,
  Text,
  Stack,
  Card,
  Alert,
} from '@mantine/core';
import { IconAlertCircle, IconPlayerPlay, IconInfoCircle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

export default function ScorecardsPage() {
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{
    timestamp: string;
    duration_ms: number;
    epics: number;
    total_days: number;
    succeeded: number;
    failed: number;
  } | null>(null);

  const handleBackfill = async () => {
    if (running) return;
    setRunning(true);
    setLastResult(null);

    try {
      const res = await fetch('/api/admin/success/backfill-active-scorecards', {
        method: 'POST',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to backfill scorecards');
      }

      const data = await res.json();
      setLastResult({
        timestamp: data.timestamp,
        duration_ms: data.duration_ms,
        epics: data.epics,
        total_days: data.total_days,
        succeeded: data.succeeded,
        failed: data.failed,
      });

      notifications.show({
        title: 'Backfill started',
        message: `Processed ${data.total_days} days across ${data.epics} epics (succeeded: ${data.succeeded}, failed: ${data.failed}).`,
        color: data.failed > 0 ? 'yellow' : 'green',
      });
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to backfill scorecards',
        color: 'red',
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Group justify="space-between" mb="md">
                <div>
                  <h1
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontSize: 'var(--font-size-page-title)',
                      fontWeight: 'var(--font-weight-bold)',
                      color: 'var(--color-gray-900)',
                    }}
                  >
                    Scorecards
                  </h1>
                  <Text size="sm" c="dimmed" mt="xs">
                    Configure and manage scorecard generation for the success measurement window.
                  </Text>
                </div>
              </Group>

              <Stack gap="md">
                <Card withBorder padding="md">
                  <Stack gap="sm">
                    <Group gap="xs">
                      <IconInfoCircle size={18} className="text-indigo-600" />
                      <Text fw={500}>Active scorecard window</Text>
                    </Group>
                    <Text size="sm" c="dimmed">
                      For each epic with a locked success configuration, scorecards are considered active from{' '}
                      <strong>T-90 days before launch</strong> through <strong>T+120 days after launch</strong>.
                    </Text>
                    <Text size="sm" c="dimmed">
                      The backfill job below will, for every epic currently within that active window, generate any missing
                      daily scorecards between <strong>launch - 90 days</strong> and <strong>min(launch + 120 days, today)</strong>.
                    </Text>
                  </Stack>
                </Card>

                <Card withBorder padding="md">
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Group gap="xs">
                          <IconPlayerPlay size={18} className="text-indigo-600" />
                          <Text fw={500}>Backfill active scorecards to today</Text>
                        </Group>
                        <Text size="sm" c="dimmed" mt={4}>
                          Runs a one-time backfill for all eligible epics currently in their active window (-90 .. +120 days).
                          This is idempotent and will skip dates where a scorecard already exists.
                        </Text>
                      </div>
                      <Button
                        leftSection={<IconPlayerPlay size={16} />}
                        loading={running}
                        onClick={handleBackfill}
                      >
                        Run backfill
                      </Button>
                    </Group>

                    {lastResult && (
                      <Alert
                        mt="sm"
                        icon={<IconAlertCircle size={16} />}
                        color={lastResult.failed > 0 ? 'yellow' : 'green'}
                        variant="light"
                      >
                        <Text size="sm">
                          Last run at{' '}
                          <strong>{new Date(lastResult.timestamp).toLocaleString()}</strong> processed{' '}
                          <strong>{lastResult.total_days}</strong> day{lastResult.total_days === 1 ? '' : 's'} across{' '}
                          <strong>{lastResult.epics}</strong> epic{lastResult.epics === 1 ? '' : 's'} in{' '}
                          <strong>{Math.round(lastResult.duration_ms / 1000)}s</strong>. Succeeded:{' '}
                          <strong>{lastResult.succeeded}</strong>, failed: <strong>{lastResult.failed}</strong>.
                        </Text>
                      </Alert>
                    )}
                  </Stack>
                </Card>
              </Stack>
    </div>
  );
}

