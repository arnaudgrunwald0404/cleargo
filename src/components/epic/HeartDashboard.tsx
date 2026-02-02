"use client";

import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  Badge,
  Progress,
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
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { HeartSetupWizard } from './HeartSetupWizard';
import { HeartManualConfigForm } from './HeartManualConfigForm';
import type {
  EpicHeartDashboard as DashboardData,
  HeartMetricDisplay,
  HeartMetricStatus,
  EpicHeartMetric,
  HeartCustomMetricTemplate,
  HeartMeasurementType,
} from '@/lib/heart/types';

interface HeartDashboardProps {
  epicId: string;
  epicName: string;
}

export function HeartDashboard({ epicId, epicName }: HeartDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [configured, setConfigured] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showAddCustomMetric, setShowAddCustomMetric] = useState(false);
  const fetchInProgressRef = React.useRef(false);

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
      const res = await fetch(`/api/epics/${epicId}/heart`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch HEART data');
      }
      const data = await res.json();
      setConfigured(data.configured);
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
  }, [epicId]);

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

  // Show setup wizard if not configured
  if (!configured || showSetup) {
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

  // Show edit form when editing existing metrics
  if (showEditForm && dashboard) {
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

  return (
    <Stack gap="md">
      {/* Header */}
      <Card withBorder padding="md">
        <Group justify="space-between">
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
              {config.setup_method === 'auto' && (
                <Badge size="xs" color="green" variant="light">Auto-configured</Badge>
              )}
            </Group>
            {daysSinceLaunch !== null && daysSinceLaunch >= 0 && (
              <Text size="sm" c="dimmed">
                Day {daysSinceLaunch} since launch
              </Text>
            )}
          </div>
          <Group gap="xs">
            <Tooltip label="Refresh data">
              <ActionIcon variant="subtle" onClick={fetchDashboard}>
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Reset and reconfigure">
              <ActionIcon 
                variant="subtle" 
                color="red"
                onClick={handleReset}
                loading={resetting}
              >
                <IconTrash size={18} />
              </ActionIcon>
            </Tooltip>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => setShowAddCustomMetric(true)}
            >
              Add Metric
            </Button>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconEdit size={14} />}
              onClick={() => setShowEditForm(true)}
            >
              Edit Metrics
            </Button>
          </Group>
        </Group>
      </Card>

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
        onSuccess={() => {
          setShowAddCustomMetric(false);
          fetchDashboard();
        }}
      />

      {/* HEART Cards */}
      <Grid>
        {metrics.map((item) => (
          <Grid.Col key={item.category.id} span={{ base: 12, sm: 6, md: 2.4 }}>
            <HeartMetricCard item={item} eventIdToName={dashboard?.pendoEventIdToName} />
          </Grid.Col>
        ))}
      </Grid>

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

// Individual HEART metric card
function HeartMetricCard({
  item,
  eventIdToName,
}: {
  item: HeartMetricDisplay;
  eventIdToName?: Record<string, string>;
}) {
  const { category, metric, latestSnapshot, trend, isPreLaunch, measurementPeriod, milestoneProgress, currentMilestone } = item;

  // Determine display value
  let displayValue: string = '--';
  let displayUnit: string = '';
  let progressValue: number = 0;
  let statusColor: string = 'gray';

  if (latestSnapshot && latestSnapshot.value !== null) {
    const value = latestSnapshot.value;
    
    // Format based on measurement type
    if (metric?.measurement_type.includes('percentage') || metric?.measurement_type.includes('rate')) {
      displayValue = `${value.toFixed(1)}`;
      displayUnit = '%';
      progressValue = Math.min(value, 100);
    } else if (metric?.measurement_type.includes('per_user')) {
      displayValue = value.toFixed(1);
      displayUnit = '/user';
    } else {
      displayValue = value.toFixed(0);
    }

    // Status color
    statusColor = latestSnapshot.status === 'ON_TRACK' ? 'green' :
                  latestSnapshot.status === 'AT_RISK' ? 'yellow' :
                  latestSnapshot.status === 'MISSED' ? 'red' : 'gray';
  }

  // Special handling for Happiness (survey-based)
  const isHappiness = category.id === 'happiness';
  const needsSurvey = isHappiness && !metric;

  // Format event/feature IDs for display: use name from map when available, else truncate event names
  const formatEventName = (eventId: string) => {
    if (eventIdToName?.[eventId]) return eventIdToName[eventId];
    // Event IDs are often like "App.Module.Action" - show last 2 parts when no map
    const parts = eventId.split('.');
    if (parts.length > 2) return parts.slice(-2).join('.');
    return eventId;
  };

  return (
    <Paper withBorder p="md" h="100%">
      <Stack gap="xs" h="100%" justify="space-between">
        <div>
          <Group gap="xs" mb="xs">
            <Text size="xl">{category.icon}</Text>
            <Text size="sm" fw={500}>{category.name}</Text>
          </Group>
          
          {needsSurvey ? (
            <div>
              <Text size="xs" c="dimmed">Survey required</Text>
              <Badge size="xs" color="yellow" variant="light" mt="xs">Coming Soon</Badge>
            </div>
          ) : !metric ? (
            <Text size="xs" c="dimmed">Not configured</Text>
          ) : (
            <>
              <Group gap={4} align="baseline">
                <Text size="xl" fw={700} c={statusColor}>
                  {displayValue}
                </Text>
                {displayUnit && (
                  <Text size="sm" c="dimmed">{displayUnit}</Text>
                )}
                {trend && (
                  <TrendIcon trend={trend} />
                )}
              </Group>
              
              {/* Zero value explanation */}
              {latestSnapshot?.value === 0 && (
                <Tooltip
                  label={isPreLaunch 
                    ? "Measurement hasn't started yet - waiting for launch date"
                    : "No events recorded yet. Check that the correct Pendo events/features are selected and that users are interacting with the feature."
                  }
                  multiline
                  w={250}
                  position="bottom"
                >
                  <Text size="xs" c="orange.6" mt={2} style={{ cursor: 'help' }}>
                    {isPreLaunch ? '⏳ Waiting for launch' : '❓ No activity detected'}
                  </Text>
                </Tooltip>
              )}
              
              {/* Show metric name */}
              {metric.name && (
                <Text size="xs" fw={500} lineClamp={1} mt={4}>
                  {metric.name}
                </Text>
              )}
              
              {/* Show Pendo events/features being tracked (names when available) */}
              {metric.pendo_event_ids && metric.pendo_event_ids.length > 0 && (
                <Tooltip
                  label={metric.pendo_event_ids
                    .map((id) => eventIdToName?.[id] ?? id)
                    .join('\n')}
                  multiline
                  w={300}
                  position="bottom"
                >
                  <Text size="xs" c="dimmed" lineClamp={1} style={{ cursor: 'help' }}>
                    📊 {metric.pendo_event_ids.length === 1
                      ? formatEventName(metric.pendo_event_ids[0])
                      : `${metric.pendo_event_ids.length} events`}
                  </Text>
                </Tooltip>
              )}
              
              {/* Show measurement period context */}
              {measurementPeriod && (
                <Text size="xs" c="dimmed" mt={2}>
                  📅 {measurementPeriod}
                </Text>
              )}
              
              {/* Show AI rationale if available */}
              {metric.ai_suggested && metric.ai_rationale && (
                <Tooltip 
                  label={metric.ai_rationale} 
                  multiline 
                  w={300}
                  position="bottom"
                >
                  <Badge size="xs" color="blue" variant="light" mt={4} style={{ cursor: 'help' }}>
                    🤖 AI suggested
                  </Badge>
                </Tooltip>
              )}
            </>
          )}
        </div>

        {/* Milestone progress display */}
        {metric && milestoneProgress && milestoneProgress.length > 0 ? (
          <div>
            {/* Mini milestone indicators */}
            <Group gap={4} mb={4}>
              {milestoneProgress.map((mp, idx) => {
                const milestoneStatusColor = mp.status === 'ON_TRACK' ? 'green' :
                  mp.status === 'AT_RISK' ? 'yellow' :
                  mp.status === 'MISSED' ? 'red' : 'gray';
                const isActive = currentMilestone?.milestone.id === mp.milestone.id;
                return (
                  <Tooltip 
                    key={mp.milestone.id}
                    label={`${mp.milestone.label || `Day ${mp.milestone.days_after_launch}`}: ${mp.milestone.target_value}% target${mp.daysRemaining !== null ? ` (${mp.daysRemaining} days left)` : ''}`}
                    position="top"
                  >
                    <div 
                      style={{ 
                        width: 8, 
                        height: 8, 
                        borderRadius: '50%', 
                        backgroundColor: `var(--mantine-color-${milestoneStatusColor}-${isActive ? '6' : '3'})`,
                        border: isActive ? '2px solid var(--mantine-color-blue-5)' : 'none',
                        cursor: 'help',
                      }} 
                    />
                  </Tooltip>
                );
              })}
            </Group>
            
            {/* Current milestone progress */}
            {currentMilestone && (
              <>
                <Progress
                  value={currentMilestone.percentComplete}
                  color={currentMilestone.status === 'ON_TRACK' ? 'green' :
                    currentMilestone.status === 'AT_RISK' ? 'yellow' :
                    currentMilestone.status === 'MISSED' ? 'red' : 'gray'}
                  size="sm"
                  radius="xl"
                />
                <Text size="xs" c="dimmed" mt={4}>
                  {currentMilestone.milestone.label || `Day ${currentMilestone.milestone.days_after_launch}`}: {currentMilestone.milestone.target_value}%
                  {currentMilestone.daysRemaining !== null && currentMilestone.daysRemaining > 0 && (
                    <Text span c="blue" size="xs"> ({currentMilestone.daysRemaining}d left)</Text>
                  )}
                </Text>
              </>
            )}
          </div>
        ) : (
          /* Fallback to single target display */
          <>
            {metric && latestSnapshot?.value !== null && progressValue > 0 && (
              <div>
                <Progress
                  value={progressValue}
                  color={statusColor}
                  size="sm"
                  radius="xl"
                />
                {metric.target_value && (
                  <Text size="xs" c="dimmed" mt={4}>
                    Target: {metric.target_value}%
                    {metric.target_timeframe_days && ` by day ${metric.target_timeframe_days}`}
                  </Text>
                )}
              </div>
            )}

            {metric && !latestSnapshot && metric.target_value && (
              <Text size="xs" c="dimmed">
                Target: {metric.target_value}%
                {metric.target_timeframe_days && ` by day ${metric.target_timeframe_days}`}
              </Text>
            )}
          </>
        )}

        {/* Status badge */}
        {latestSnapshot ? (
          <Badge
            size="xs"
            color={isPreLaunch ? 'blue' : statusColor}
            variant="light"
            fullWidth
          >
            {isPreLaunch ? '🚀 Pre-launch' :
             latestSnapshot.status === 'ON_TRACK' ? '✓ On Track' :
             latestSnapshot.status === 'AT_RISK' ? '⚠ At Risk' :
             latestSnapshot.status === 'MISSED' ? '✗ Missed' : 'Pending'}
          </Badge>
        ) : metric ? (
          <Badge size="xs" color="gray" variant="light" fullWidth>
            Awaiting data
          </Badge>
        ) : null}
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
  const formattedLaunchDate = launchDate 
    ? new Date(launchDate).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      })
    : null;

  return (
    <Group gap="md">
      <Group gap="xs">
        <IconCalendar size={14} color="var(--mantine-color-dimmed)" />
        <Text size="sm" c="dimmed">
          {formattedLaunchDate ? (
            <>
              Measurement starts: <strong>{formattedLaunchDate}</strong>
              {isPreLaunch && <Badge size="xs" color="blue" variant="light" ml="xs">Upcoming</Badge>}
            </>
          ) : (
            <Text span c="orange.6">No launch date set (using last 7 days)</Text>
          )}
        </Text>
      </Group>
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
const MEASUREMENT_TYPES: { value: HeartMeasurementType; label: string }[] = [
  { value: 'events_per_user', label: 'Events per User' },
  { value: 'events_per_user_per_week', label: 'Events per User per Week' },
  { value: 'unique_users_percentage', label: 'Unique Users %' },
  { value: 'unique_users_count', label: 'Unique Users Count' },
  { value: 'return_rate_7_days', label: '7-day Return Rate' },
  { value: 'return_rate_14_days', label: '14-day Return Rate' },
  { value: 'return_rate_30_days', label: '30-day Return Rate' },
  { value: 'completion_rate', label: 'Completion Rate' },
  { value: 'success_rate', label: 'Success Rate' },
];

function AddCustomMetricModal({
  opened,
  onClose,
  epicId,
  configId,
  onSuccess,
}: {
  opened: boolean;
  onClose: () => void;
  epicId: string;
  configId: string;
  onSuccess: () => void;
}) {
  const [templates, setTemplates] = useState<HeartCustomMetricTemplate[]>([]);
  const [pendoEvents, setPendoEvents] = useState<Array<{ value: string; label: string }>>([]);
  const [pendoFeatures, setPendoFeatures] = useState<Array<{ value: string; label: string; kind: string }>>([]);
  const [pendoSegments, setPendoSegments] = useState<Array<{ value: string; label: string }>>([]);
  const [pendoIdToLabel, setPendoIdToLabel] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [categoryLabel, setCategoryLabel] = useState('');
  const [icon, setIcon] = useState('📊');
  const [measurementType, setMeasurementType] = useState<HeartMeasurementType | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [targetValue, setTargetValue] = useState<number | ''>('');
  const [timeframeDays, setTimeframeDays] = useState<number | ''>('');
  const [description, setDescription] = useState('');

  // Combined event/feature IDs for API
  const pendoEventIds = [...selectedEventIds, ...selectedFeatureIds];

  // Load templates and Pendo data
  useEffect(() => {
    if (!opened) return;
    
    const loadData = async () => {
      setLoading(true);
      try {
        const [templatesRes, eventsRes, featuresRes, segmentsRes] = await Promise.all([
          fetch('/api/settings/success-measurement/heart/templates?active_only=true'),
          fetch('/api/settings/success-measurement/pendo/events'),
          fetch('/api/settings/success-measurement/pendo/features'),
          fetch('/api/settings/success-measurement/pendo/segments'),
        ]);
        
        if (templatesRes.ok) {
          const data = await templatesRes.json();
          setTemplates(Array.isArray(data) ? data : []);
        }

        const idToLabel: Record<string, string> = {};

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
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [opened]);

  // When template is selected, prefill form
  useEffect(() => {
    if (selectedTemplate === 'custom') {
      // Custom - clear form for manual entry
      setName('');
      setCategoryLabel('');
      setIcon('📊');
      setMeasurementType(null);
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

  const handleSave = async () => {
    if (!name || !categoryLabel || !measurementType || pendoEventIds.length === 0) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please fill in name, category, measurement type, and select at least one Pendo event',
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
          is_custom: true,
          custom_category_label: categoryLabel,
          custom_icon: icon,
          template_id: selectedTemplate !== 'custom' ? selectedTemplate : null,
          name,
          description: description || null,
          measurement_type: measurementType,
          pendo_event_ids: pendoEventIds,
          pendo_segment_id: selectedSegmentId,
          target_value: typeof targetValue === 'number' ? targetValue : null,
          target_timeframe_days: typeof timeframeDays === 'number' ? timeframeDays : null,
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
      setSelectedTemplate(null);
      setName('');
      setCategoryLabel('');
      setIcon('📊');
      setMeasurementType(null);
      setSelectedEventIds([]);
      setSelectedFeatureIds([]);
      setSelectedSegmentId(null);
      setTargetValue('');
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
      title="Add Custom Metric"
      size="lg"
    >
      {loading ? (
        <Stack align="center" py="xl">
          <Skeleton height={200} />
        </Stack>
      ) : (
        <Stack gap="md">
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
            placeholder="e.g., Revenue Impact"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

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

          <Select
            label="Measurement Type"
            placeholder="Select how to measure"
            data={MEASUREMENT_TYPES}
            value={measurementType}
            onChange={(v) => setMeasurementType(v as HeartMeasurementType | null)}
            required
          />

          {/* Data Source Selection */}
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
                valueComponent={({ value }) => {
                  const displayName = pendoIdToLabel[value] || value;
                  const feature = pendoFeatures.find(f => f.value === value);
                  const featureIcon = feature?.kind === 'Page' ? '📄' : '✨';
                  return (
                    <Badge
                      size="sm"
                      variant="light"
                      color="grape"
                      style={{ marginRight: 4 }}
                      title={displayName}
                    >
                      {featureIcon} {displayName.length > 20 ? displayName.slice(0, 17) + '...' : displayName}
                    </Badge>
                  );
                }}
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

          <Group grow>
            <NumberInput
              label="Target Value (%)"
              placeholder="e.g., 75"
              value={targetValue}
              onChange={(v) => setTargetValue(typeof v === 'number' ? v : '')}
              min={0}
              max={100}
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
            placeholder="What does this metric measure?"
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
      )}
    </Modal>
  );
}
