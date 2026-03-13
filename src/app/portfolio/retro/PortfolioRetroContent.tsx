"use client";

import React, { useEffect, useState } from 'react';
import {
  Stack,
  Title,
  Text,
  Card,
  Group,
  Button,
  MultiSelect,
  Accordion,
  Badge,
  List,
  ThemeIcon,
  Alert,
  Loader,
} from '@mantine/core';
import {
  IconRobot,
  IconAlertTriangle,
  IconClock,
  IconTags,
  IconBulb,
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

interface PortfolioRetro {
  generated_at: string;
  epic_count: number;
  output: RetroOutput;
}

export function PortfolioRetroContent() {
  const [epics, setEpics] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedEpicIds, setSelectedEpicIds] = useState<string[]>([]);
  const [retro, setRetro] = useState<PortfolioRetro | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithRateLimit('/api/epics', { maxRetries: 1 })
      .then((res) => res.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setEpics(
          arr.map((e: any) => ({
            value: e.id,
            label: e.name || e.id,
          }))
        );
      })
      .catch((err) => console.error('Failed to load epics:', err));
  }, []);

  const handleGenerate = async () => {
    if (selectedEpicIds.length === 0) return;
    setLoading(true);
    setError(null);
    setRetro(null);
    try {
      const res = await fetch('/api/ai-retro/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ epic_ids: selectedEpicIds }),
      });
      if (res.ok) {
        const data = await res.json();
        setRetro(data.retro || null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Failed to generate portfolio retro');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const output = retro?.output;

  return (
    <Stack gap="lg" p="md" maw={900} mx="auto">
      <div>
        <Title order={2} style={{ fontFamily: 'var(--font-heading)' }}>
          Portfolio Retrospective
        </Title>
        <Text size="sm" c="dimmed" mt={4}>
          Generate an AI-powered retrospective across multiple epics to identify cross-cutting
          patterns, systemic bottlenecks, and recommendations.
        </Text>
      </div>

      <Card withBorder padding="md">
        <Stack gap="sm">
          <MultiSelect
            label="Select epics"
            placeholder="Choose epics to include in the retro"
            data={epics}
            value={selectedEpicIds}
            onChange={setSelectedEpicIds}
            searchable
            maxDropdownHeight={300}
          />
          <Group>
            <Button
              leftSection={<IconRobot size={16} />}
              color="violet"
              onClick={handleGenerate}
              loading={loading}
              disabled={selectedEpicIds.length === 0}
            >
              Generate Portfolio Retro
            </Button>
            {selectedEpicIds.length > 0 && (
              <Text size="xs" c="dimmed">
                {selectedEpicIds.length} epic{selectedEpicIds.length !== 1 ? 's' : ''} selected
              </Text>
            )}
          </Group>
        </Stack>
      </Card>

      {error && (
        <Alert color="red" variant="light" title="Error">
          {error}
        </Alert>
      )}

      {loading && (
        <Card withBorder padding="lg">
          <Group justify="center" py="xl">
            <Loader size="md" color="violet" />
            <Text size="sm" c="dimmed">
              Generating portfolio retrospective… This may take a minute.
            </Text>
          </Group>
        </Card>
      )}

      {output && (
        <Card withBorder padding="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <IconRobot size={20} />
                <Text fw={500} size="lg">Portfolio Analysis</Text>
              </Group>
              <Text size="xs" c="dimmed">
                {retro?.epic_count} epics · Generated{' '}
                {retro?.generated_at
                  ? new Date(retro.generated_at).toLocaleDateString()
                  : ''}
              </Text>
            </Group>

            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {output.summary}
            </Text>

            <Accordion variant="contained" radius="md">
              {output.late_items.length > 0 && (
                <Accordion.Item value="late">
                  <Accordion.Control
                    icon={
                      <IconAlertTriangle size={18} color="var(--mantine-color-orange-6)" />
                    }
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
                            Expected by {item.expected_by} · Resolved {item.actual_date} ·{' '}
                            {item.days_late} days late
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
      )}
    </Stack>
  );
}
