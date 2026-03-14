"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
  Collapse,
  Box,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconArrowUp,
  IconArrowDown,
  IconExternalLink,
} from '@tabler/icons-react';
import { PurpleLoader } from '@/components/PurpleLoader';
import { SuccessOverviewSparkline } from './SuccessOverviewSparkline';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import type { HeartCategoryId } from '@/lib/heart/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SparklinePoint {
  date: string;
  value: number | null;
}

interface HeartCategoryData {
  latestValue: number | null;
  latestStatus: string | null;
  sparklineData: SparklinePoint[];
  metricName: string;
}

interface LegacyMetricData {
  name: string;
  actual: number | null;
  target: number | null;
  status: string;
}

interface SuccessOverviewEpic {
  epicId: string;
  epicName: string;
  productName: string | null;
  ownerName: string | null;
  launchDate: string | null;
  status: string;
  tier: string;
  measurementSystem: 'heart' | 'legacy';
  overallHealth: string | null;
  heartCategories?: Partial<Record<HeartCategoryId, HeartCategoryData>>;
  legacyMetrics?: LegacyMetricData[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEART_CATEGORIES: { id: HeartCategoryId; label: string; color: string }[] = [
  { id: 'happiness', label: 'H', color: '#1c7ed6' },
  { id: 'engagement', label: 'E', color: '#12b886' },
  { id: 'adoption', label: 'A', color: '#fab005' },
  { id: 'retention', label: 'R', color: '#fa5252' },
  { id: 'task_success', label: 'T', color: '#7950f2' },
];

const HEALTH_COLORS: Record<string, string> = {
  ON_TRACK: 'green',
  AT_RISK: 'yellow',
  MISSED: 'red',
  PENDING: 'gray',
};

const STATUS_LABELS: Record<string, string> = {
  Pre_Release: 'Pre-Release',
  Released_Cohort_1: 'Cohort 1',
  Released_GA: 'GA',
  Released_Retroed: 'Retroed',
  Cancelled: 'Cancelled',
};

type SortField = 'epicName' | 'launchDate' | 'overallHealth' | 'status';

const HEALTH_ORDER: Record<string, number> = {
  MISSED: 0,
  AT_RISK: 1,
  PENDING: 2,
  ON_TRACK: 3,
};

// ---------------------------------------------------------------------------
// Full-size line chart for expanded rows (adapted from ScorecardTimeSeries)
// ---------------------------------------------------------------------------

function ExpandedLineChart({
  series,
  dates,
}: {
  series: Array<{ key: string; color: string; label: string; values: Array<number | null> }>;
  dates: string[];
}) {
  const width = 700;
  const height = 220;
  const padding = { top: 10, right: 16, bottom: 28, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = series.flatMap(s => s.values.filter((v): v is number => v !== null));
  const min = allValues.length ? Math.min(...allValues) : 0;
  const max = allValues.length ? Math.max(...allValues) : 1;
  const range = max - min || 1;

  const x = (i: number) => padding.left + (i / Math.max(1, dates.length - 1)) * innerW;
  const y = (v: number) => padding.top + innerH - (innerH * (v - min)) / range;

  const mkPath = (vals: Array<number | null>) => {
    let d = '';
    vals.forEach((v, i) => {
      if (v === null) return;
      const cx = x(i);
      const cy = y(v);
      d += d ? ` L ${cx},${cy}` : `M ${cx},${cy}`;
    });
    return d;
  };

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => min + (range * i) / ticks);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Success metrics chart">
      {yTicks.map((t, i) => {
        const yy = y(t);
        return (
          <g key={i}>
            <line x1={padding.left} x2={width - padding.right} y1={yy} y2={yy} stroke="#eee" />
            <text x={padding.left - 6} y={yy} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#888">
              {Number.isFinite(t) ? (t >= 1000 ? `${(t / 1000).toFixed(1)}k` : t.toFixed(t % 1 === 0 ? 0 : 1)) : '0'}
            </text>
          </g>
        );
      })}

      {dates.map((d, i) => {
        const date = new Date(d);
        const showLabel = i === 0 || i === dates.length - 1 || date.getDate() === 1;
        if (!showLabel) return null;
        const xx = x(i);
        return (
          <g key={d}>
            <line x1={xx} x2={xx} y1={padding.top} y2={height - padding.bottom} stroke="#f5f5f5" />
            <text x={xx} y={height - padding.bottom + 14} textAnchor="middle" fontSize={10} fill="#888">
              {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          </g>
        );
      })}

      {series.map(s => (
        <path key={s.key} d={mkPath(s.values)} stroke={s.color} fill="none" strokeWidth={2} strokeLinecap="round" />
      ))}

      {/* Legend */}
      {series.map((s, i) => (
        <g key={`legend-${s.key}`} transform={`translate(${padding.left + i * 110}, ${height - 6})`}>
          <rect width={10} height={3} fill={s.color} rx={1} />
          <text x={14} y={3} fontSize={9} fill="#666">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Expanded row
// ---------------------------------------------------------------------------

function ExpandedRow({ epic }: { epic: SuccessOverviewEpic }) {
  if (epic.measurementSystem === 'heart' && epic.heartCategories) {
    // Build series for the chart
    const allDates = new Set<string>();
    for (const cat of Object.values(epic.heartCategories)) {
      if (cat) cat.sparklineData.forEach(p => allDates.add(p.date));
    }
    const dates = Array.from(allDates).sort();

    const series = HEART_CATEGORIES
      .filter(c => epic.heartCategories?.[c.id])
      .map(c => {
        const catData = epic.heartCategories![c.id]!;
        const dataMap = new Map(catData.sparklineData.map(p => [p.date, p.value]));
        return {
          key: c.id,
          color: c.color,
          label: catData.metricName || c.id,
          values: dates.map(d => dataMap.get(d) ?? null),
        };
      });

    return (
      <Box p="md" style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
        <Group justify="space-between" mb="sm">
          <Text fw={600} size="sm">HEART Metrics Trend</Text>
          <UnstyledButton component={Link} href={`/epics/${epic.epicId}`}>
            <Group gap={4}>
              <Text size="xs" c="dimmed">View full epic</Text>
              <IconExternalLink size={14} color="var(--mantine-color-dimmed)" />
            </Group>
          </UnstyledButton>
        </Group>

        {dates.length > 1 ? (
          <ExpandedLineChart series={series} dates={dates} />
        ) : (
          <Text size="sm" c="dimmed" py="lg" ta="center">Not enough data points to chart yet.</Text>
        )}

        <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} mt="md" spacing="sm">
          {HEART_CATEGORIES.map(cat => {
            const d = epic.heartCategories?.[cat.id];
            return (
              <Card key={cat.id} withBorder padding="xs" radius="sm">
                <Text size="xs" c="dimmed" fw={500}>{cat.id.replace('_', ' ').toUpperCase()}</Text>
                {d ? (
                  <>
                    <Text size="lg" fw={700}>{d.latestValue !== null ? d.latestValue.toLocaleString() : '--'}</Text>
                    {d.latestStatus && (
                      <Badge size="xs" color={HEALTH_COLORS[d.latestStatus] || 'gray'} variant="light">
                        {d.latestStatus.replace('_', ' ')}
                      </Badge>
                    )}
                  </>
                ) : (
                  <Text size="sm" c="dimmed">Not configured</Text>
                )}
              </Card>
            );
          })}
        </SimpleGrid>
      </Box>
    );
  }

  // Legacy measurement system
  return (
    <Box p="md" style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
      <Group justify="space-between" mb="sm">
        <Text fw={600} size="sm">Success Scorecard Metrics</Text>
        <UnstyledButton component={Link} href={`/epics/${epic.epicId}`}>
          <Group gap={4}>
            <Text size="xs" c="dimmed">View full epic</Text>
            <IconExternalLink size={14} color="var(--mantine-color-dimmed)" />
          </Group>
        </UnstyledButton>
      </Group>

      {epic.legacyMetrics && epic.legacyMetrics.length > 0 ? (
        <Table withTableBorder withColumnBorders striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Metric</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Actual</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Target</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {epic.legacyMetrics.map((m, i) => (
              <Table.Tr key={i}>
                <Table.Td>{m.name}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{m.actual !== null ? m.actual.toLocaleString() : '--'}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{m.target !== null ? m.target.toLocaleString() : '--'}</Table.Td>
                <Table.Td>
                  <Badge size="xs" color={HEALTH_COLORS[m.status] || 'gray'} variant="light">
                    {m.status.replace('_', ' ')}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text size="sm" c="dimmed" py="lg" ta="center">No scorecard data available yet.</Text>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SuccessOverviewTabProps {
  filters: {
    tier: string;
    pod: string;
    dateRangeStart: string;
    dateRangeEnd: string;
  };
  refreshKey?: number;
}

export function SuccessOverviewTab({ filters, refreshKey }: SuccessOverviewTabProps) {
  const [data, setData] = useState<SuccessOverviewEpic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('launchDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.tier) params.append('tier', filters.tier);
      if (filters.pod) params.append('pod', filters.pod);

      const res = await fetchWithRateLimit(`/api/analytics/success-overview?${params}`, {
        credentials: 'include',
        maxRetries: 1,
      });

      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json.epics || []);
    } catch (err: any) {
      console.error('Failed to fetch success overview:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [filters.tier, filters.pod]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'epicName':
          cmp = a.epicName.localeCompare(b.epicName);
          break;
        case 'launchDate':
          cmp = (a.launchDate || '').localeCompare(b.launchDate || '');
          break;
        case 'overallHealth':
          cmp = (HEALTH_ORDER[a.overallHealth || ''] ?? 99) - (HEALTH_ORDER[b.overallHealth || ''] ?? 99);
          break;
        case 'status':
          cmp = (a.status || '').localeCompare(b.status || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [data, sortField, sortDir]);

  // Summary stats
  const stats = useMemo(() => {
    const total = data.length;
    const onTrack = data.filter(e => e.overallHealth === 'ON_TRACK').length;
    const atRisk = data.filter(e => e.overallHealth === 'AT_RISK').length;
    const missed = data.filter(e => e.overallHealth === 'MISSED').length;
    return { total, onTrack, atRisk, missed };
  }, [data]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'launchDate' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <PurpleLoader />
      </div>
    );
  }

  if (error) {
    return (
      <Card withBorder padding="xl">
        <Text c="red" ta="center">{error}</Text>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card withBorder padding="xl">
        <Stack gap="sm" align="center">
          <Title order={4}>No Success Data Yet</Title>
          <Text c="dimmed" ta="center" maw={400}>
            No epics have success metrics configured. Set up HEART metrics or success scorecards on an epic to see them here.
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      {/* Summary cards */}
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Card withBorder padding="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Tracked Epics</Text>
          <Text size="xl" fw={700}>{stats.total}</Text>
        </Card>
        <Card withBorder padding="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>On Track</Text>
          <Text size="xl" fw={700} c="green">{stats.onTrack}</Text>
        </Card>
        <Card withBorder padding="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>At Risk</Text>
          <Text size="xl" fw={700} c="yellow.7">{stats.atRisk}</Text>
        </Card>
        <Card withBorder padding="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Missed</Text>
          <Text size="xl" fw={700} c="red">{stats.missed}</Text>
        </Card>
      </SimpleGrid>

      {/* Table */}
      <Card withBorder padding={0}>
        <Table.ScrollContainer minWidth={900}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 28 }} />
                <Table.Th>
                  <UnstyledButton onClick={() => toggleSort('epicName')}>
                    <Group gap={4}><Text size="xs" fw={600}>Epic</Text><SortIcon field="epicName" /></Group>
                  </UnstyledButton>
                </Table.Th>
                <Table.Th><Text size="xs" fw={600}>Product</Text></Table.Th>
                <Table.Th><Text size="xs" fw={600}>PM</Text></Table.Th>
                <Table.Th>
                  <UnstyledButton onClick={() => toggleSort('launchDate')}>
                    <Group gap={4}><Text size="xs" fw={600}>Launch</Text><SortIcon field="launchDate" /></Group>
                  </UnstyledButton>
                </Table.Th>
                <Table.Th>
                  <UnstyledButton onClick={() => toggleSort('status')}>
                    <Group gap={4}><Text size="xs" fw={600}>Status</Text><SortIcon field="status" /></Group>
                  </UnstyledButton>
                </Table.Th>
                <Table.Th><Text size="xs" fw={600}>System</Text></Table.Th>
                <Table.Th>
                  <UnstyledButton onClick={() => toggleSort('overallHealth')}>
                    <Group gap={4}><Text size="xs" fw={600}>Health</Text><SortIcon field="overallHealth" /></Group>
                  </UnstyledButton>
                </Table.Th>
                {HEART_CATEGORIES.map(c => (
                  <Table.Th key={c.id} style={{ textAlign: 'center', minWidth: 110 }}>
                    <Text size="xs" fw={600} c={c.color}>{c.label}</Text>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sorted.map(epic => {
                const isExpanded = expandedId === epic.epicId;
                return (
                  <React.Fragment key={epic.epicId}>
                    <Table.Tr
                      onClick={() => setExpandedId(isExpanded ? null : epic.epicId)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Table.Td>
                        {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500} lineClamp={1}>{epic.epicName}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed" lineClamp={1}>{epic.productName || '--'}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed" lineClamp={1}>{epic.ownerName || '--'}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">
                          {epic.launchDate
                            ? new Date(epic.launchDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                            : '--'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" variant="light" color="gray">
                          {STATUS_LABELS[epic.status] || epic.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" variant="dot" color={epic.measurementSystem === 'heart' ? 'violet' : 'blue'}>
                          {epic.measurementSystem === 'heart' ? 'HEART' : 'Legacy'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {epic.overallHealth ? (
                          <Badge size="sm" color={HEALTH_COLORS[epic.overallHealth] || 'gray'} variant="filled">
                            {epic.overallHealth.replace('_', ' ')}
                          </Badge>
                        ) : (
                          <Text size="xs" c="dimmed">--</Text>
                        )}
                      </Table.Td>
                      {HEART_CATEGORIES.map(cat => {
                        const catData = epic.heartCategories?.[cat.id];
                        if (!catData) {
                          return (
                            <Table.Td key={cat.id} style={{ textAlign: 'center' }}>
                              <Text size="xs" c="dimmed">--</Text>
                            </Table.Td>
                          );
                        }
                        return (
                          <Table.Td key={cat.id} style={{ textAlign: 'center' }}>
                            <Stack gap={2} align="center">
                              <SuccessOverviewSparkline
                                data={catData.sparklineData}
                                status={catData.latestStatus}
                              />
                              <Text size="xs" fw={500}>
                                {catData.latestValue !== null ? catData.latestValue.toLocaleString() : '--'}
                              </Text>
                            </Stack>
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>

                    {/* Expanded row */}
                    {isExpanded && (
                      <Table.Tr>
                        <Table.Td colSpan={8 + HEART_CATEGORIES.length} p={0}>
                          <Collapse in={isExpanded}>
                            <ExpandedRow epic={epic} />
                          </Collapse>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </React.Fragment>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}
