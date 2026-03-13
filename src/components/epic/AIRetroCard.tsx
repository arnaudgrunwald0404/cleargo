"use client";

import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Badge,
  Button,
  Accordion,
  List,
  ThemeIcon,
  Loader,
  Alert,
} from '@mantine/core';
import {
  IconRobot,
  IconRefresh,
  IconAlertTriangle,
  IconClock,
  IconBulb,
  IconTags,
} from '@tabler/icons-react';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';

interface LateItem {
  criterion: string;
  expected_by: string;
  actual_date: string;
  days_late: number;
  context: string;
}

interface StuckItem {
  criterion: string;
  status: string;
  duration_days: number;
  context: string;
}

interface RetroOutput {
  summary: string;
  late_items: LateItem[];
  stuck_items: StuckItem[];
  themes: string[];
  recommendations: string[];
}

interface AIRetro {
  id: string;
  epic_id: string;
  generated_at: string;
  retro_output: RetroOutput;
}

interface AIRetroCardProps {
  epicId: string;
}

export function AIRetroCard({ epicId }: AIRetroCardProps) {
  const [retro, setRetro] = useState<AIRetro | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRetro = useCallback(async () => {
    try {
      const res = await fetchWithRateLimit(`/api/epics/${epicId}/ai-retro`, {
        maxRetries: 1,
      });
      if (res.ok) {
        const data = await res.json();
        setRetro(data.retro || null);
      }
    } catch (err) {
      console.error('Failed to fetch AI retro:', err);
    } finally {
      setLoading(false);
    }
  }, [epicId]);

  useEffect(() => {
    fetchRetro();
  }, [fetchRetro]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/epics/${epicId}/ai-retro`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setRetro(data.retro || null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Failed to generate retro');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <Card withBorder padding="md">
        <Group justify="center" py="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading AI retrospective…</Text>
        </Group>
      </Card>
    );
  }

  if (!retro) {
    return (
      <Card withBorder padding="md">
        <Stack gap="sm">
          <Group gap="xs">
            <IconRobot size={20} />
            <Text fw={500} size="lg">AI Retrospective</Text>
          </Group>
          <Text size="sm" c="dimmed">
            No AI retrospective generated yet. Generate one to get an automated analysis of what
            was late, stuck, and the key themes from comments.
          </Text>
          {error && (
            <Alert color="red" variant="light" title="Error">
              {error}
            </Alert>
          )}
          <Button
            variant="light"
            color="violet"
            leftSection={<IconRobot size={16} />}
            onClick={handleGenerate}
            loading={generating}
          >
            Generate AI Retrospective
          </Button>
        </Stack>
      </Card>
    );
  }

  const output = retro.retro_output;

  return (
    <Card withBorder padding="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            <IconRobot size={20} />
            <Text fw={500} size="lg">AI Retrospective</Text>
          </Group>
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              Generated {new Date(retro.generated_at).toLocaleDateString()}
            </Text>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={handleGenerate}
              loading={generating}
            >
              Regenerate
            </Button>
          </Group>
        </Group>

        {error && (
          <Alert color="red" variant="light" title="Error">
            {error}
          </Alert>
        )}

        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {output.summary}
        </Text>

        <Accordion variant="contained" radius="md">
          {output.late_items.length > 0 && (
            <Accordion.Item value="late">
              <Accordion.Control
                icon={<IconAlertTriangle size={18} color="var(--mantine-color-orange-6)" />}
              >
                <Group gap="xs">
                  <Text size="sm" fw={500}>Late Items</Text>
                  <Badge size="sm" color="orange" variant="light">
                    {output.late_items.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <List spacing="sm" size="sm">
                  {output.late_items.map((item, idx) => (
                    <List.Item key={idx}>
                      <Text size="sm" fw={500}>{item.criterion}</Text>
                      <Text size="xs" c="dimmed">
                        Expected by {item.expected_by} · Resolved {item.actual_date} · {item.days_late} days late
                      </Text>
                      <Text size="xs" c="dimmed" fs="italic">{item.context}</Text>
                    </List.Item>
                  ))}
                </List>
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {output.stuck_items.length > 0 && (
            <Accordion.Item value="stuck">
              <Accordion.Control
                icon={<IconClock size={18} color="var(--mantine-color-red-6)" />}
              >
                <Group gap="xs">
                  <Text size="sm" fw={500}>Stuck Items</Text>
                  <Badge size="sm" color="red" variant="light">
                    {output.stuck_items.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <List spacing="sm" size="sm">
                  {output.stuck_items.map((item, idx) => (
                    <List.Item key={idx}>
                      <Text size="sm" fw={500}>{item.criterion}</Text>
                      <Text size="xs" c="dimmed">
                        Stuck in {item.status} for {item.duration_days} days
                      </Text>
                      <Text size="xs" c="dimmed" fs="italic">{item.context}</Text>
                    </List.Item>
                  ))}
                </List>
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {output.themes.length > 0 && (
            <Accordion.Item value="themes">
              <Accordion.Control
                icon={<IconTags size={18} color="var(--mantine-color-blue-6)" />}
              >
                <Group gap="xs">
                  <Text size="sm" fw={500}>Themes</Text>
                  <Badge size="sm" color="blue" variant="light">
                    {output.themes.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <List spacing="xs" size="sm">
                  {output.themes.map((theme, idx) => (
                    <List.Item key={idx}>
                      <Text size="sm">{theme}</Text>
                    </List.Item>
                  ))}
                </List>
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {output.recommendations.length > 0 && (
            <Accordion.Item value="recommendations">
              <Accordion.Control
                icon={<IconBulb size={18} color="var(--mantine-color-green-6)" />}
              >
                <Group gap="xs">
                  <Text size="sm" fw={500}>Recommendations</Text>
                  <Badge size="sm" color="green" variant="light">
                    {output.recommendations.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <List
                  spacing="xs"
                  size="sm"
                  icon={
                    <ThemeIcon color="green" size={20} radius="xl" variant="light">
                      <IconBulb size={12} />
                    </ThemeIcon>
                  }
                >
                  {output.recommendations.map((rec, idx) => (
                    <List.Item key={idx}>
                      <Text size="sm">{rec}</Text>
                    </List.Item>
                  ))}
                </List>
              </Accordion.Panel>
            </Accordion.Item>
          )}
        </Accordion>
      </Stack>
    </Card>
  );
}
