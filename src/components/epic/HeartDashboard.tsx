"use client";

import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  Badge,
  Grid,
  Paper,
  Button,
  Alert,
  Skeleton,
  Tooltip,
  ActionIcon,
  Modal,
  Select,
  TextInput,
  NumberInput,
  MultiSelect,
  Textarea,
  SegmentedControl,
  Autocomplete,
  Tabs,
  Box,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconEdit,
  IconRefresh,
  IconTrash,
  IconPlus,
  IconCalendar,
  IconWorldShare,
  IconWorldOff,
  IconExternalLink,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { formatDateOnlyForDisplay } from '@/lib/date-utils';
import { HeartSetupWizard } from './HeartSetupWizard';
import { HeartManualConfigForm } from './HeartManualConfigForm';
import { HeartMetricTracker, getWindowBounds, toDateKey } from './HeartMetricTracker';
import type { HeartTrackerWindow } from './HeartMetricTracker';
import type {
  EpicHeartDashboard as DashboardData,
  HeartMetricDisplay,
  HeartMetricStatus,
  EpicHeartMetric,
  HeartCustomMetricTemplate,
  HeartMeasurementType,
  HeartCategoryId,
} from '@/lib/heart/types';
import { calculateFrustrationHealth } from '@/lib/heart/happiness-composite';
import {
  isTaskSuccessRateType,
  hasTaskSuccessPeriodPercentageRaw,
} from '@/lib/heart/taskSuccessMetric';

/** Minimal success config for Publish/Unpublish in header (only on Success Metrics page). */
export interface HeartDashboardSuccessConfig {
  success_metrics_published_at?: string | null;
}

interface HeartDashboardProps {
  epicId: string;
  epicName: string;
  /** When provided, Publish/Unpublish is shown in the HEART Metrics header (Success Metrics page only). */
  successConfig?: HeartDashboardSuccessConfig | null;
  canConfigureSuccessMetrics?: boolean;
  onSuccessConfigRefresh?: () => Promise<void>;
}

export function HeartDashboard({
  epicId,
  epicName,
  successConfig = null,
  canConfigureSuccessMetrics = false,
  onSuccessConfigRefresh,
}: HeartDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [configured, setConfigured] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showAddCustomMetric, setShowAddCustomMetric] = useState(false);
  const [chartWindow, setChartWindow] = useState<HeartTrackerWindow>('7D');
  const [asOfDate, setAsOfDate] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const fetchInProgressRef = React.useRef(false);

  const isSuccessPublished = !!(successConfig?.success_metrics_published_at);
  const handlePublishSuccess = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/success/config/publish`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to publish');
      }
      await onSuccessConfigRefresh?.();
      notifications.show({ title: 'Success metrics published', message: 'Everyone can now see these metrics.', color: 'green' });
    } catch (err: any) {
      notifications.show({ title: 'Failed to publish', message: err.message, color: 'red' });
    } finally {
      setPublishing(false);
    }
  };
  const handleUnpublishSuccess = async () => {
    if (!confirm('Unpublish success metrics? Only users who can configure them will see the configuration until you publish again.')) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/success/config/unpublish`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to unpublish');
      }
      await onSuccessConfigRefresh?.();
      notifications.show({ title: 'Success metrics unpublished', message: 'Metrics are now in draft. Only configurers can see them.', color: 'blue' });
    } catch (err: any) {
      notifications.show({ title: 'Failed to unpublish', message: err.message, color: 'red' });
    } finally {
      setPublishing(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset HEART metrics? This will delete all current configuration.')) {
      return;
    }
    
    setResetting(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/heart`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reset HEART config');
      }
      
      notifications.show({
        title: 'HEART Metrics Reset',
        message: 'You can now reconfigure your metrics.',
        color: 'blue',
      });
      
      setConfigured(false);
      setDashboard(null);
      setShowSetup(false);
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message,
        color: 'red',
      });
    } finally {
      setResetting(false);
    }
  };

  const fetchDashboard = async () => {
    if (fetchInProgressRef.current) return;
    fetchInProgressRef.current = true;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (asOfDate) params.set('asOf', asOfDate);
      if (chartWindow) params.set('window', chartWindow);
      const url = `/api/epics/${epicId}/heart${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch HEART data');
      }
      const data = await res.json();
      setConfigured(data.configured);
      setCanEdit(!!data.canEdit);
      if (data.configured) {
        setDashboard(data);
        setShowSetup(false);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [epicId, asOfDate, chartWindow]);

  if (loading) {
    return (
      <Card withBorder padding="lg">
        <Stack gap="md">
          <Skeleton height={30} width="50%" />
          <Grid>
            {[1, 2, 3, 4, 5].map((i) => (
              <Grid.Col key={i} span={{ base: 12, sm: 6, md: 2.4 }}>
                <Skeleton height={120} />
              </Grid.Col>
            ))}
          </Grid>
        </Stack>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
        {error}
        <Button variant="subtle" size="xs" onClick={fetchDashboard} mt="xs">
          Retry
        </Button>
      </Alert>
    );
  }

  // Not configured: show setup wizard only if user can edit; otherwise read-only message
  if (!configured || showSetup) {
    if (!canEdit) {
      return (
        <Card withBorder padding="lg">
          <Stack gap="sm">
            <Text size="lg" fw={600}>HEART Metrics</Text>
            <Text size="sm" c="dimmed">
              Success Metrics have not been configured for this epic yet. Someone with Configure Success Metrics access can set this up.
            </Text>
          </Stack>
        </Card>
      );
    }
    return (
      <HeartSetupWizard
        epicId={epicId}
        epicName={epicName}
        onSetupComplete={() => {
          setShowSetup(false);
          fetchDashboard();
        }}
      />
    );
  }

  // Show edit form when editing existing metrics (only reachable when canEdit)
  if (showEditForm && dashboard && canEdit) {
    // Extract existing metrics from the dashboard
    const existingMetrics: EpicHeartMetric[] = dashboard.metrics
      .filter(m => m.metric)
      .map(m => m.metric as EpicHeartMetric);
    
    return (
      <HeartManualConfigForm
        epicId={epicId}
        configId={dashboard.config.id}
        existingMetrics={existingMetrics}
        onSave={() => {
          setShowEditForm(false);
          fetchDashboard();
        }}
        onCancel={() => setShowEditForm(false)}
      />
    );
  }

  if (!dashboard) {
    return null;
  }

  const { config, metrics, overallStatus, daysSinceLaunch } = dashboard;

  const todayStr = new Date().toISOString().split('T')[0]!;

  return (
    <Stack gap="md" style={{ width: '100%', maxWidth: '100%', alignItems: 'stretch' }}>
      {/* Header */}
      <Card withBorder padding="md">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <div>
            <Group gap="xs">
              <Text size="lg" fw={600}>HEART Metrics</Text>
              <Badge
                color={
                  overallStatus === 'ON_TRACK' ? 'green' :
                  overallStatus === 'AT_RISK' ? 'yellow' :
                  overallStatus === 'MISSED' ? 'red' : 'gray'
                }
              >
                {overallStatus === 'ON_TRACK' ? 'On Track' :
                 overallStatus === 'AT_RISK' ? 'At Risk' :
                 overallStatus === 'MISSED' ? 'Missed' : 'Pending'}
              </Badge>
            </Group>
            {daysSinceLaunch !== null && daysSinceLaunch >= 0 && (
              <Text size="sm" c="dimmed">
                Day {daysSinceLaunch} since release
              </Text>
            )}
          </div>
          <Group gap="sm" align="center" wrap="wrap">
            {dashboard.pendoDashboardUrl && (
              <Button
                component="a"
                href={dashboard.pendoDashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="light"
                size="xs"
                leftSection={<IconExternalLink size={14} />}
              >
                View Pendo dashboard
              </Button>
            )}
            {/* Publish first so it's always visible */}
            {canConfigureSuccessMetrics && (
              <>
                {successConfig ? (
                  <>
                    {isSuccessPublished ? (
                      <Badge leftSection={<IconWorldShare size={12} />} color="green" variant="light">Published</Badge>
                    ) : (
                      <Badge leftSection={<IconWorldOff size={12} />} color="gray" variant="light">Draft</Badge>
                    )}
                    {isSuccessPublished ? (
                      <Button size="xs" variant="light" color="gray" leftSection={<IconWorldOff size={14} />} onClick={handleUnpublishSuccess} loading={publishing}>
                        Unpublish
                      </Button>
                    ) : (
                      <Button size="xs" color="green" leftSection={<IconWorldShare size={14} />} onClick={handlePublishSuccess} loading={publishing}>
                        Publish
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Badge leftSection={<IconWorldOff size={12} />} color="gray" variant="light">Draft</Badge>
                    {dashboard ? (
                      <Tooltip label="Make these metrics visible to everyone">
                        <Button size="xs" color="green" leftSection={<IconWorldShare size={14} />} onClick={handlePublishSuccess} loading={publishing}>
                          Publish
                        </Button>
                      </Tooltip>
                    ) : (
                      <Tooltip label="Set up HEART metrics above first">
                        <span>
                          <Button size="xs" color="green" leftSection={<IconWorldShare size={14} />} disabled>
                            Publish
                          </Button>
                        </span>
                      </Tooltip>
                    )}
                  </>
                )}
              </>
            )}
            {canEdit && (
              <>
                <Box component="span" style={{ width: 1, alignSelf: 'stretch', background: 'var(--mantine-color-default-border)', margin: '0 2px' }} aria-hidden />
                <Tooltip label="Refresh data">
                  <ActionIcon variant="subtle" size="sm" onClick={fetchDashboard}>
                    <IconRefresh size={18} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Reset and reconfigure">
                  <ActionIcon variant="subtle" color="red" size="sm" onClick={handleReset} loading={resetting}>
                    <IconTrash size={18} />
                  </ActionIcon>
                </Tooltip>
                <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setShowAddCustomMetric(true)}>
                  Add Metric
                </Button>
                <Button variant="light" size="xs" leftSection={<IconEdit size={14} />} onClick={() => setShowEditForm(true)}>
                  Edit Metrics
                </Button>
              </>
            )}
            {/* As of (inline in header) */}
            {!dashboard?.asOfDate ? (
              <Group gap={4} align="center" wrap="nowrap">
                <Text size="xs" c="dimmed">As of</Text>
                <input
                  type="date"
                  value={asOfDate ?? todayStr}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setAsOfDate(v && v !== todayStr ? v : null);
                  }}
                  style={{ width: 132, padding: '2px 6px', fontSize: 12, border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}
                />
                {asOfDate && (
                  <Button variant="subtle" size="xs" onClick={() => setAsOfDate(null)}>Clear</Button>
                )}
              </Group>
            ) : (
              <Group gap={4} align="center">
                <Text size="xs" c="dimmed">As of {(dashboard?.asOfDate ?? asOfDate) ?? ''}</Text>
                <Button variant="subtle" size="xs" onClick={() => setAsOfDate(null)}>Live</Button>
              </Group>
            )}
          </Group>
        </Group>
      </Card>

      {/* As-of date view banner (compact, only when viewing a past date) */}
      {(dashboard?.asOfDate || asOfDate) && (
        <Alert color="blue" variant="light" py="xs" px="sm">
          <Group justify="space-between" gap="xs">
            <Text size="xs">Snapshot data as of {(dashboard?.asOfDate ?? asOfDate) ?? ''}. Not live.</Text>
            <Button variant="subtle" size="xs" onClick={() => setAsOfDate(null)}>Show live</Button>
          </Group>
        </Alert>
      )}

      {/* Data Collection Info Banner */}
      <DataCollectionInfo 
        launchDate={dashboard?.launchDate || null}
        daysSinceLaunch={daysSinceLaunch}
      />


      {/* Add Custom Metric Modal */}
      <AddCustomMetricModal
        opened={showAddCustomMetric}
        onClose={() => setShowAddCustomMetric(false)}
        epicId={epicId}
        configId={dashboard?.config.id || ''}
        existingMetrics={metrics}
        onSuccess={() => {
          setShowAddCustomMetric(false);
          fetchDashboard();
        }}
      />

      {/* HEART Cards — show period average/sum over selected chart window (e.g. 1M) */}
      <Grid>
        {metrics.filter(item => !item.metric?.is_custom).map((item) => {
          const releaseDate = dashboard?.launchDate ?? null;
          const periodResult = getPeriodValue(item, chartWindow, releaseDate);
          const periodTrend = getPeriodTrend(item, chartWindow, releaseDate);
          return (
            <Grid.Col key={item.category.id} span={{ base: 12, sm: 6, md: 2.4 }}>
              <HeartMetricCard
                item={item}
                periodValue={periodResult.value}
                periodTrend={periodTrend}
                isPostReleaseOnly={periodResult.isPostReleaseOnly}
                eventIdToName={dashboard?.pendoEventIdToName}
                releaseDate={releaseDate}
              />
            </Grid.Col>
          );
        })}
      </Grid>

      {/* HEART Trends — one tab per metric (H, E, A, R, T), full-width chart */}
      {metrics.some(item => !item.metric?.is_custom && item.metric) && (
        <Card withBorder padding="lg" style={{ width: '100%', maxWidth: 'none' }}>
          <Text size="sm" fw={600} c="dimmed" mb="md">HEART Trends</Text>
          <Tabs
            defaultValue={metrics.find(m => !m.metric?.is_custom && m.metric)?.category.id ?? 'happiness'}
            variant="pills"
            radius="md"
          >
            <Tabs.List>
              {metrics
                .filter(item => !item.metric?.is_custom && item.metric)
                .map((item) => (
                  <Tabs.Tab key={item.category.id} value={item.category.id}>
                    {item.category.name}
                  </Tabs.Tab>
                ))}
            </Tabs.List>
            {metrics
              .filter(item => !item.metric?.is_custom && item.metric)
              .map((item) => (
                <Tabs.Panel key={item.category.id} value={item.category.id} pt="md">
                  <Box style={{ width: '100%', minWidth: 0 }}>
                    <HeartMetricTracker
                      item={item}
                      releaseDate={dashboard?.launchDate || null}
                      height={280}
                      showFill
                      fullWidth
                      window={chartWindow}
                      onWindowChange={setChartWindow}
                    />
                  </Box>
                </Tabs.Panel>
              ))}
          </Tabs>
        </Card>
      )}

      {/* Standalone Custom Metrics (not aligned to HEART) */}
      {metrics.some(item => item.metric?.is_custom) && (
        <>
          <Text size="sm" fw={500} c="dimmed" mt="xs">Custom Metrics</Text>
          <Grid>
            {metrics.filter(item => item.metric?.is_custom).map((item) => (
              <Grid.Col key={item.category.id} span={{ base: 12, sm: 6, md: 3 }}>
                <HeartMetricCard
                  item={item}
                  eventIdToName={dashboard?.pendoEventIdToName}
                  releaseDate={dashboard?.launchDate || null}
                />
              </Grid.Col>
            ))}
          </Grid>
        </>
      )}

      {/* Alerts / Insights */}
      {overallStatus === 'AT_RISK' && (
        <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="Attention Needed">
          Some metrics are at risk. Review the metrics below target and consider action items.
        </Alert>
      )}

      {overallStatus === 'MISSED' && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Targets Missed">
          One or more metrics have missed their targets. Schedule a retrospective to discuss learnings.
        </Alert>
      )}
    </Stack>
  );
}

/** Result of getPeriodValue: value and whether it was restricted to post-release days. */
function getPeriodValue(
  item: HeartMetricDisplay,
  window: HeartTrackerWindow,
  releaseDate?: string | null
): { value: number | null; isPostReleaseOnly?: boolean } {
  const history = item.history ?? [];
  const { start, end } = getWindowBounds(window);
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const releaseKey = releaseDate ? releaseDate.split('T')[0] : null;
  const releaseInWindow =
    releaseKey && releaseKey >= startKey && releaseKey <= endKey;

  // Adoption (unique_users_percentage): use period-level ratio (unique visitors ÷ total app visitors), not average of daily %
  const raw = item.metricContext?.raw;
  if (
    item.metric?.measurement_type === 'unique_users_percentage' &&
    typeof raw?.uniqueVisitors === 'number' &&
    typeof raw?.totalAppVisitors === 'number' &&
    raw.totalAppVisitors > 0
  ) {
    const periodPct = (raw.uniqueVisitors / raw.totalAppVisitors) * 100;
    return {
      value: Math.round(periodPct * 10) / 10,
      isPostReleaseOnly: Boolean(releaseInWindow),
    };
  }

  // Happiness = inverse of frustration: 0 frustration → 100. Use frustration health from raw counts when available.
  if (
    (item.category.id === 'happiness' || item.metric?.measurement_type === 'happiness_composite_score') &&
    typeof raw?.frustrationSignals === 'number' &&
    typeof raw?.uniqueVisitors === 'number'
  ) {
    const maxPenalty = item.metric?.composite_config?.happiness?.frustrationEventsPer100UsersAtMaxPenalty ?? 30;
    const { health } = calculateFrustrationHealth(
      raw.frustrationSignals,
      raw.uniqueVisitors,
      maxPenalty
    );
    return {
      value: Math.round(health * 10) / 10,
      isPostReleaseOnly: Boolean(releaseInWindow),
    };
  }

  if (history.length === 0) return { value: null };
  const inRange = (s: { snapshot_date: string }) => {
    if (s.snapshot_date < startKey || s.snapshot_date > endKey) return false;
    if (releaseInWindow && releaseKey && s.snapshot_date < releaseKey) return false;
    return true;
  };

  // Task Success — single event: period-level % of users (matches Pendo); two events: sum(starts)/sum(completes)
  const isTaskSuccessRate = isTaskSuccessRateType(item.metric?.measurement_type ?? '');
  if (isTaskSuccessRate && hasTaskSuccessPeriodPercentageRaw(item.metricContext?.raw)) {
    const raw = item.metricContext!.raw!;
    const periodPct = (raw.uniqueVisitors / raw.totalAppVisitors) * 100;
    return {
      value: Math.round(periodPct * 10) / 10,
      isPostReleaseOnly: Boolean(releaseInWindow),
    };
  }
  if (isTaskSuccessRate) {
    let totalStarts = 0;
    let totalCompletions = 0;
    for (const s of history) {
      if (!inRange(s)) continue;
      const raw = s.pendo_raw_data as { startCount?: number; completeCount?: number } | undefined;
      if (raw && typeof raw.startCount === 'number' && typeof raw.completeCount === 'number') {
        totalStarts += raw.startCount;
        totalCompletions += raw.completeCount;
      }
    }
    if (totalStarts > 0) {
      const periodRate = (totalCompletions / totalStarts) * 100;
      return {
        value: Math.round(periodRate * 100) / 100,
        isPostReleaseOnly: Boolean(releaseInWindow),
      };
    }
  }

  const values: number[] = [];
  for (const s of history) {
    if (s.value === null || s.value === undefined) continue;
    if (inRange(s)) values.push(s.value);
  }
  if (values.length === 0)
    return { value: null, isPostReleaseOnly: Boolean(releaseInWindow) };
  const sum = values.reduce((a, b) => a + b, 0);
  if (item.historyUnit === 'completions' || item.historyUnit === 'frustration') {
    return {
      value: sum,
      isPostReleaseOnly: Boolean(releaseInWindow),
    };
  }
  return {
    value: sum / values.length,
    isPostReleaseOnly: Boolean(releaseInWindow),
  };
}

/** Trend over the selected period: first half vs second half (and post-release filter when applicable). */
function getPeriodTrend(
  item: HeartMetricDisplay,
  window: HeartTrackerWindow,
  releaseDate?: string | null
): 'up' | 'down' | 'stable' | null {
  const history = item.history ?? [];
  if (history.length < 2) return null;
  const { start, end } = getWindowBounds(window);
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const releaseKey = releaseDate ? releaseDate.split('T')[0] : null;
  const releaseInWindow =
    releaseKey && releaseKey >= startKey && releaseKey <= endKey;

  const inRange = (s: { snapshot_date: string }) => {
    if (s.snapshot_date < startKey || s.snapshot_date > endKey) return false;
    if (releaseInWindow && releaseKey && s.snapshot_date < releaseKey) return false;
    return true;
  };

  const points: { date: string; value: number }[] = [];
  for (const s of history) {
    if (s.value === null || s.value === undefined) continue;
    if (inRange(s)) points.push({ date: s.snapshot_date, value: s.value });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  // Require enough points so first-half vs second-half trend is meaningful; otherwise avoid misleading red/green
  if (points.length < 2) return null;
  const MIN_POINTS_FOR_TREND = 4;
  if (points.length < MIN_POINTS_FOR_TREND) return null;

  const mid = Math.floor(points.length / 2);
  const firstHalf = points.slice(0, mid);
  const secondHalf = points.slice(mid);

  const isTaskSuccessRate = isTaskSuccessRateType(item.metric?.measurement_type ?? '');
  if (isTaskSuccessRate) {
    const firstDates = new Set(firstHalf.map((p) => p.date));
    const secondDates = new Set(secondHalf.map((p) => p.date));
    let s1 = 0; let c1 = 0; let s2 = 0; let c2 = 0;
    for (const s of history) {
      if (!inRange(s)) continue;
      const raw = s.pendo_raw_data as { startCount?: number; completeCount?: number } | undefined;
      if (!raw || typeof raw.startCount !== 'number' || typeof raw.completeCount !== 'number') continue;
      if (firstDates.has(s.snapshot_date)) {
        s1 += raw.startCount;
        c1 += raw.completeCount;
      } else if (secondDates.has(s.snapshot_date)) {
        s2 += raw.startCount;
        c2 += raw.completeCount;
      }
    }
    const rate1 = s1 > 0 ? (c1 / s1) * 100 : 0;
    const rate2 = s2 > 0 ? (c2 / s2) * 100 : 0;
    if (rate2 > rate1) return 'up';
    if (rate2 < rate1) return 'down';
    return 'stable';
  }

  const isSum =
    item.historyUnit === 'completions' || item.historyUnit === 'frustration';
  const firstAgg = isSum
    ? firstHalf.reduce((a, p) => a + p.value, 0)
    : firstHalf.reduce((a, p) => a + p.value, 0) / firstHalf.length;
  const secondAgg = isSum
    ? secondHalf.reduce((a, p) => a + p.value, 0)
    : secondHalf.reduce((a, p) => a + p.value, 0) / secondHalf.length;

  if (secondAgg > firstAgg) return 'up';
  if (secondAgg < firstAgg) return 'down';
  return 'stable';
}

// Individual HEART metric card
function HeartMetricCard({
  item,
  periodValue,
  periodTrend,
  isPostReleaseOnly,
  eventIdToName: _eventIdToName,
  releaseDate: _releaseDate,
}: {
  item: HeartMetricDisplay;
  /** When set, card shows this value (period average/sum over chart window) instead of latest snapshot */
  periodValue?: number | null;
  /** Period trend (first half vs second half); kept for possible future neutral indicator; color is status-only */
  periodTrend?: 'up' | 'down' | 'stable' | null;
  /** When true, value is aggregate over post-release days only; show "Post-release" label */
  isPostReleaseOnly?: boolean;
  eventIdToName?: Record<string, string>;
  releaseDate?: string | null;
}) {
  const { category, metric, latestSnapshot, historyUnit } = item;

  let displayValue = '--';
  let displayUnit = '';

  const value = periodValue !== undefined && periodValue !== null
    ? periodValue
    : (latestSnapshot && latestSnapshot.value !== null ? latestSnapshot.value : null);

  if (value !== null) {
    // Happiness = 0–100 score (inverse of frustration); show as whole number
    if (category.id === 'happiness' || metric?.measurement_type === 'happiness_composite_score') {
      displayValue = value.toFixed(0);
      displayUnit = ' out of 100';
    } else if (historyUnit === 'completions' || historyUnit === 'frustration') {
      displayValue = value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toLocaleString();
    } else if (metric?.measurement_type?.includes('percentage') || metric?.measurement_type?.includes('rate')) {
      displayValue = value.toFixed(1);
      displayUnit = '%';
    } else if (metric?.measurement_type?.includes('per_user')) {
      const rounded = Math.round(value);
      displayValue = rounded >= 10000
        ? `${(rounded / 1000).toFixed(0)}K`
        : rounded >= 1000
        ? rounded.toLocaleString()
        : String(rounded);
      displayUnit = metric.measurement_type === 'events_per_user_per_week' ? 'events/user/wk' : 'events per user';
    } else {
      displayValue = value.toFixed(0);
    }
  }

  // Color by target status only (HEART framework: progress toward goals, not raw trend). Strict: green = on track, red = missed target, orange = at risk; no trend-based red/green.
  const status = latestSnapshot?.status;
  const valueColor =
    status === 'ON_TRACK' ? 'green.7' :
    status === 'MISSED' ? 'red.6' :
    status === 'AT_RISK' ? 'orange.6' :
    'gray.7';
  return (
    <Paper withBorder p="md" h="100%" radius="md" bg="white" style={{ minWidth: 0 }}>
      <Stack gap={8} h="100%" justify="space-between" style={{ minWidth: 0 }}>
        <Text size="sm" fw={600} c="dimmed">{category.name}</Text>

        <Stack gap={4}>
          <Text size="34px" fw={700} lh={1} c={valueColor}>
            {displayValue}
          </Text>
          {item.liveError && (
            <Text size="xs" c="red.6" lineClamp={2} title={item.liveError}>
              {item.liveError}
            </Text>
          )}
          {(displayUnit || (metric?.measurement_type === 'completion_rate' || metric?.measurement_type === 'success_rate') && value != null) && (
            <Group gap={6} wrap="wrap">
              {displayUnit && <Text size="sm" c="dimmed">{displayUnit}</Text>}
              {(metric?.measurement_type === 'completion_rate' || metric?.measurement_type === 'success_rate') && value != null && (
                <Text size="xs" c="dimmed">completion rate</Text>
              )}
            </Group>
          )}
        </Stack>

        {(isPostReleaseOnly || item.metricContext?.isPageToActionRate) && (
          <Text size="xs" c="dimmed" lineClamp={1}>
            {[isPostReleaseOnly ? 'Post-release' : null, item.metricContext?.isPageToActionRate ? 'Page→action rate' : null].filter(Boolean).join(' · ')}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

// Data Collection Info Component
function DataCollectionInfo({
  launchDate,
  daysSinceLaunch,
}: {
  launchDate: string | null;
  daysSinceLaunch: number | null;
}) {
  const isPreLaunch = daysSinceLaunch === null || daysSinceLaunch < 0;
  const formattedReleaseDate = launchDate
    ? formatDateOnlyForDisplay(launchDate, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Group gap="md">
      <Group gap="xs">
        <IconCalendar size={14} color="var(--mantine-color-dimmed)" />
        <Text size="sm" c="dimmed">
          {formattedReleaseDate ? (
            <>
              Release: <strong>{formattedReleaseDate}</strong>
              {isPreLaunch && <Badge size="xs" color="blue" variant="light" ml="xs">Upcoming</Badge>}
            </>
          ) : (
            <Text span c="orange.6">No release date set</Text>
          )}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        {formattedReleaseDate
          ? 'Charts show pre-release (then) vs post-release (now). The orange Release line marks the divider.'
          : 'Set a release date to see the Release line and post-release segment on each chart.'}
      </Text>
    </Group>
  );
}

// Trend indicator
function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') {
    return (
      <Tooltip label="Trending up">
        <IconTrendingUp size={16} color="green" />
      </Tooltip>
    );
  }
  if (trend === 'down') {
    return (
      <Tooltip label="Trending down">
        <IconTrendingDown size={16} color="red" />
      </Tooltip>
    );
  }
  return (
    <Tooltip label="Stable">
      <IconMinus size={16} color="gray" />
    </Tooltip>
  );
}

// Add Custom Metric Modal
const PENDO_MEASUREMENT_TYPES: { value: HeartMeasurementType; label: string }[] = [
  { value: 'events_per_user', label: 'Events per User' },
  { value: 'events_per_user_per_week', label: 'Events per User per Week' },
  { value: 'unique_users_percentage', label: 'Unique Users %' },
  { value: 'unique_users_count', label: 'Unique Users Count' },
  { value: 'unique_companies_count', label: 'Unique Companies Count' },
  { value: 'return_rate_7_days', label: '7-day Return Rate' },
  { value: 'return_rate_14_days', label: '14-day Return Rate' },
  { value: 'return_rate_30_days', label: '30-day Return Rate' },
  { value: 'completion_rate', label: 'Completion Rate' },
  { value: 'success_rate', label: 'Success Rate' },
];

type CustomMetricDataSource = 'pendo' | 'manual';

// HEART categories with labels for the selector
const HEART_CATEGORY_OPTIONS: Array<{ value: string; label: string; icon: string }> = [
  { value: 'none', label: 'None (Standalone Custom Metric)', icon: '📊' },
  { value: 'happiness', label: 'Happiness', icon: '😊' },
  { value: 'engagement', label: 'Engagement', icon: '📈' },
  { value: 'adoption', label: 'Adoption', icon: '🚀' },
  { value: 'retention', label: 'Retention', icon: '🔄' },
  { value: 'task_success', label: 'Task Success', icon: '✅' },
];

function AddCustomMetricModal({
  opened,
  onClose,
  epicId,
  configId,
  existingMetrics,
  onSuccess,
}: {
  opened: boolean;
  onClose: () => void;
  epicId: string;
  configId: string;
  existingMetrics: HeartMetricDisplay[];
  onSuccess: () => void;
}) {
  const [templates, setTemplates] = useState<HeartCustomMetricTemplate[]>([]);
  const [pendoEvents, setPendoEvents] = useState<Array<{ value: string; label: string }>>([]);
  const [pendoFeatures, setPendoFeatures] = useState<Array<{ value: string; label: string; kind: string }>>([]);
  const [pendoSegments, setPendoSegments] = useState<Array<{ value: string; label: string }>>([]);
  const [pendoIdToLabel, setPendoIdToLabel] = useState<Record<string, string>>({});
  const [pendoAvailable, setPendoAvailable] = useState(false);
  const [loadingPendo, setLoadingPendo] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [heartCategory, setHeartCategory] = useState<string>('none');
  const [dataSource, setDataSource] = useState<CustomMetricDataSource>('manual');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [categoryLabel, setCategoryLabel] = useState('');
  const [icon, setIcon] = useState('📊');

  // Determine which HEART categories already have a metric configured
  const configuredHeartCategories = new Set(
    existingMetrics
      .filter(m => m.metric && !m.metric.is_custom && m.metric.heart_category)
      .map(m => m.metric!.heart_category!)
  );

  const isStandalone = heartCategory === 'none';
  const selectedHeartCat = HEART_CATEGORY_OPTIONS.find(c => c.value === heartCategory);
  const [measurementType, setMeasurementType] = useState('');
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [targetValue, setTargetValue] = useState<number | ''>('');
  const [targetUnit, setTargetUnit] = useState<string>('%');
  const [timeframeDays, setTimeframeDays] = useState<number | ''>('');
  const [description, setDescription] = useState('');

  // Combined event/feature IDs for API
  const pendoEventIds = [...selectedEventIds, ...selectedFeatureIds];

  // Load templates (fast) immediately, then Pendo data in background
  useEffect(() => {
    if (!opened) return;
    
    // Load templates quickly (doesn't depend on Pendo)
    fetch('/api/settings/success-measurement/heart/templates?active_only=true')
      .then(res => res.ok ? res.json() : [])
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]));
    
    // Load Pendo data in background (can be slow - don't block the form)
    const loadPendoData = async () => {
      setLoadingPendo(true);
      try {
        // Use activeOnly=false to skip per-event count checks (much faster)
        const [eventsRes, featuresRes, segmentsRes] = await Promise.all([
          fetch('/api/settings/success-measurement/pendo/events?activeOnly=false'),
          fetch('/api/settings/success-measurement/pendo/features'),
          fetch('/api/settings/success-measurement/pendo/segments'),
        ]);

        const idToLabel: Record<string, string> = {};
        let hasAnyPendoData = false;

        // Process events
        if (eventsRes.ok) {
          const data = await eventsRes.json();
          if (data.events && Array.isArray(data.events)) {
            const eventOptions = data.events
              .filter((e: any) => e && e.name)
              .map((e: any) => {
                idToLabel[e.name] = e.name;
                return {
                  value: e.name,
                  label: e.name + (e.productArea ? ` [${e.productArea}]` : ''),
                };
              });
            setPendoEvents(eventOptions);
            if (eventOptions.length > 0) hasAnyPendoData = true;
          }
        }

        // Process features
        if (featuresRes.ok) {
          const data = await featuresRes.json();
          if (data.features && Array.isArray(data.features)) {
            const featureOptions = data.features
              .filter((f: any) => f && f.id && f.name)
              .map((f: any) => {
                idToLabel[f.id] = f.name;
                return {
                  value: f.id,
                  label: f.name,
                  kind: f.kind || 'Feature',
                };
              });
            setPendoFeatures(featureOptions);
            if (featureOptions.length > 0) hasAnyPendoData = true;
          }
        }

        // Process segments
        if (segmentsRes.ok) {
          const data = await segmentsRes.json();
          if (data.segments && Array.isArray(data.segments)) {
            setPendoSegments(
              data.segments
                .filter((s: any) => s && s.id && s.name)
                .map((s: any) => ({
                  value: s.id,
                  label: s.name,
                }))
            );
          }
        }

        setPendoIdToLabel(idToLabel);
        setPendoAvailable(hasAnyPendoData);
      } catch (err) {
        console.error('Error loading Pendo data:', err);
        setPendoAvailable(false);
      } finally {
        setLoadingPendo(false);
      }
    };
    
    loadPendoData();
  }, [opened]);

  // When template is selected, prefill form
  useEffect(() => {
    if (selectedTemplate === 'custom') {
      // Custom - clear form for manual entry
      setName('');
      setCategoryLabel('');
      setIcon('📊');
      setMeasurementType('');
      setTargetValue('');
      setTimeframeDays('');
      setDescription('');
      return;
    }
    
    const template = templates.find(t => t.id === selectedTemplate);
    if (template) {
      setName(template.name);
      setCategoryLabel(template.category_label);
      setIcon(template.icon);
      setMeasurementType(template.measurement_type);
      setTargetValue(template.default_target_value ?? '');
      setTimeframeDays(template.default_target_timeframe_days ?? '');
      setDescription(template.description || '');
    }
  }, [selectedTemplate, templates]);

  const isManualSource = dataSource === 'manual';

  const handleSave = async () => {
    // Validation differs by data source and HEART alignment
    if (!name || !measurementType.trim()) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please fill in name and measurement type',
        color: 'red',
      });
      return;
    }
    if (isStandalone && !categoryLabel) {
      notifications.show({
        title: 'Validation Error',
        message: 'Standalone metrics need a category label',
        color: 'red',
      });
      return;
    }

    if (!isManualSource && pendoEventIds.length === 0) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please select at least one Pendo event or feature, or switch to Manual Entry',
        color: 'red',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/heart/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // If aligned to a HEART category, it's a regular metric, not a custom one
          is_custom: isStandalone,
          heart_category: isStandalone ? null : heartCategory,
          data_source: dataSource,
          custom_category_label: isStandalone ? categoryLabel : null,
          custom_icon: isStandalone ? icon : null,
          template_id: selectedTemplate !== 'custom' ? selectedTemplate : null,
          name,
          description: description || null,
          measurement_type: measurementType,
          pendo_event_ids: isManualSource ? [] : pendoEventIds,
          pendo_segment_id: isManualSource ? null : selectedSegmentId,
          target_value: typeof targetValue === 'number' ? targetValue : null,
          target_timeframe_days: typeof timeframeDays === 'number' ? timeframeDays : null,
          target_unit: isManualSource ? (targetUnit || null) : '%',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create metric');
      }

      notifications.show({
        title: 'Success',
        message: 'Custom metric added successfully',
        color: 'green',
      });
      
      // Reset form
      setHeartCategory('none');
      setDataSource(pendoAvailable ? 'pendo' : 'manual');
      setSelectedTemplate(null);
      setName('');
      setCategoryLabel('');
      setIcon('📊');
      setMeasurementType('');
      setSelectedEventIds([]);
      setSelectedFeatureIds([]);
      setSelectedSegmentId(null);
      setTargetValue('');
      setTargetUnit(pendoAvailable ? '%' : '');
      setTimeframeDays('');
      setDescription('');
      
      onSuccess();
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to create metric',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Add Metric"
      size="lg"
    >
      <Stack gap="md">
          {/* HEART Category Alignment */}
          <Select
            label="HEART Category"
            description="Align this metric with a HEART category, or keep it standalone"
            data={HEART_CATEGORY_OPTIONS.map(opt => ({
              value: opt.value,
              label: `${opt.icon} ${opt.label}`,
              disabled: opt.value !== 'none' && configuredHeartCategories.has(opt.value as HeartCategoryId),
            }))}
            value={heartCategory}
            onChange={(v) => setHeartCategory(v || 'none')}
            renderOption={({ option }) => {
              const isConfigured = option.value !== 'none' && configuredHeartCategories.has(option.value as HeartCategoryId);
              return (
                <Group gap="xs">
                  <Text size="sm">{option.label}</Text>
                  {isConfigured && <Badge size="xs" color="gray" variant="light">Already configured</Badge>}
                </Group>
              );
            }}
          />

          {!isStandalone && (
            <Paper withBorder p="xs" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderColor: 'var(--mantine-color-blue-2)' }}>
              <Text size="xs" c="dimmed">
                This metric will appear under the <strong>{selectedHeartCat?.icon} {selectedHeartCat?.label}</strong> card in the HEART dashboard.
              </Text>
            </Paper>
          )}

          <Select
            label="Start from template (optional)"
            description="Select a template or create from scratch"
            placeholder="Select a template..."
            data={[
              { value: 'custom', label: '✨ Create from scratch' },
              ...templates.map(t => ({
                value: t.id,
                label: `${t.icon} ${t.name} (${t.category_label})`,
              })),
            ]}
            value={selectedTemplate}
            onChange={setSelectedTemplate}
            clearable
          />

          <TextInput
            label="Metric Name"
            placeholder={isStandalone ? 'e.g., Revenue Impact' : `e.g., ${selectedHeartCat?.label} Score`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          {/* Category Label and Icon only for standalone metrics */}
          {isStandalone && (
            <Group grow>
              <TextInput
                label="Category Label"
                description="How this category appears in the dashboard"
                placeholder="e.g., Revenue, Efficiency"
                value={categoryLabel}
                onChange={(e) => setCategoryLabel(e.target.value)}
                required
              />
              <TextInput
                label="Icon"
                description="Emoji for this category"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={4}
                style={{ maxWidth: 100 }}
              />
            </Group>
          )}

          {/* Data Source Selection */}
          <Paper withBorder p="sm" bg="gray.0">
            <Text size="sm" fw={500} mb="xs">Data Source</Text>
            <Text size="xs" c="dimmed" mb="sm">
              Choose where the data for this metric comes from.
            </Text>
            <SegmentedControl
              value={dataSource}
              onChange={(v) => {
                setDataSource(v as CustomMetricDataSource);
                setMeasurementType('');
                setTargetUnit(v === 'pendo' ? '%' : '');
                setSelectedEventIds([]);
                setSelectedFeatureIds([]);
                setSelectedSegmentId(null);
              }}
              data={[
                { 
                  label: loadingPendo ? '📊 Pendo (loading...)' : `📊 Pendo${!pendoAvailable ? ' (not connected)' : ''}`,
                  value: 'pendo',
                  disabled: !pendoAvailable && !loadingPendo,
                },
                { label: '✏️ Manual Entry', value: 'manual' },
              ]}
              fullWidth
            />
          </Paper>

          {isManualSource ? (
            <TextInput
              label="What are you measuring?"
              description="Describe the metric type (e.g., Unique Companies Count, Revenue Impact, NPS Score)"
              placeholder="e.g., Unique Companies Count, Monthly Active Users, Completion Rate %"
              value={measurementType}
              onChange={(e) => setMeasurementType(e.currentTarget.value)}
              required
            />
          ) : (
            <Select
              label="Measurement Type"
              placeholder="Select how to measure"
              data={PENDO_MEASUREMENT_TYPES}
              value={measurementType || null}
              onChange={(v) => setMeasurementType(v || '')}
              required
            />
          )}

          {!isManualSource && (
            <>
              {/* Pendo Data Source Selection */}
              <Paper withBorder p="sm" bg="gray.0">
                <Text size="sm" fw={500} mb="xs">What to Track</Text>
                <Text size="xs" c="dimmed" mb="md">
                  Choose Track Events (custom code events) OR Features (tagged UI elements).
                </Text>
                
                <Stack gap="sm">
                  <MultiSelect
                    label={
                      <Group gap={4}>
                        <Text size="sm">📊 Track Events</Text>
                        <Text size="xs" c="dimmed">(custom pendo.track() calls)</Text>
                      </Group>
                    }
                    placeholder="Search track events..."
                    data={pendoEvents}
                    value={selectedEventIds}
                    onChange={setSelectedEventIds}
                    searchable
                    clearable
                    maxDropdownHeight={200}
                  />
                  
                  <MultiSelect
                    label={
                      <Group gap={4}>
                        <Text size="sm">🏷️ Tagged Features</Text>
                        <Text size="xs" c="dimmed">(UI elements tagged in Pendo)</Text>
                      </Group>
                    }
                    placeholder="Search tagged features..."
                    data={pendoFeatures.map(f => ({
                      value: f.value,
                      label: `${f.kind === 'Page' ? '📄' : '✨'} ${f.label} (${f.kind})`,
                    }))}
                    value={selectedFeatureIds}
                    onChange={setSelectedFeatureIds}
                    searchable
                    clearable
                    maxDropdownHeight={200}
                  />
                </Stack>
                
                {pendoEventIds.length > 0 && (
                  <Text size="xs" c="green" mt="sm">
                    ✓ Tracking {pendoEventIds.length} item(s)
                  </Text>
                )}
              </Paper>

              {/* Segment filter */}
              <Select
                label="👥 User Segment (Optional)"
                description="Filter to a specific cohort of users"
                placeholder="All users"
                data={pendoSegments}
                value={selectedSegmentId}
                onChange={setSelectedSegmentId}
                clearable
                searchable
              />
            </>
          )}

          {isManualSource && (
            <>
              <Paper withBorder p="sm" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderColor: 'var(--mantine-color-blue-2)' }}>
                <Text size="sm" fw={500} mb="xs">Manual Entry</Text>
                <Text size="xs" c="dimmed">
                  You'll record values for this metric manually over time. Use this for data from 
                  external systems, spreadsheets, surveys, or any source outside Pendo.
                </Text>
              </Paper>

              <Autocomplete
                label="Target Unit"
                description="What unit are you tracking? Type your own or pick a suggestion."
                placeholder="e.g., %, Users, Organizations, Score"
                data={['%', 'Users', 'Organizations', 'Companies', 'Count', 'Score', 'Points', 'Responses']}
                value={targetUnit}
                onChange={(v) => setTargetUnit(v)}
              />
            </>
          )}

          <Group grow>
            <NumberInput
              label={isManualSource ? `Target Value${targetUnit ? ` (${targetUnit})` : ''}` : 'Target Value (%)'}
              placeholder={isManualSource ? 'e.g., 50, 1000, 95' : 'e.g., 75'}
              value={targetValue}
              onChange={(v) => setTargetValue(typeof v === 'number' ? v : '')}
              min={0}
              {...(!isManualSource ? { max: 100 } : {})}
            />
            <NumberInput
              label="Timeframe (days)"
              placeholder="e.g., 30"
              value={timeframeDays}
              onChange={(v) => setTimeframeDays(typeof v === 'number' ? v : '')}
              min={1}
              max={365}
            />
          </Group>

          <Textarea
            label="Description (optional)"
            placeholder={isManualSource 
              ? "Describe what this metric measures and where the data comes from..."
              : "What does this metric measure?"}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Add Metric
            </Button>
          </Group>
        </Stack>
    </Modal>
  );
}
