"use client";

import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  Button,
  Paper,
  Select,
  MultiSelect,
  NumberInput,
  Textarea,
  Badge,
  Accordion,
  Loader,
  Alert,
  Divider,
  Tabs,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { HeartCategoryId, HeartMeasurementType, EpicHeartMetric } from '@/lib/heart/types';

interface HeartManualConfigFormProps {
  epicId: string;
  configId: string;
  existingMetrics?: EpicHeartMetric[];
  onSave: () => void;
  onCancel: () => void;
}

// HEART category definitions
const HEART_CATEGORIES: Array<{
  id: HeartCategoryId;
  name: string;
  icon: string;
  description: string;
  measurementTypes: Array<{ value: HeartMeasurementType; label: string }>;
  requiresSurvey?: boolean;
}> = [
  {
    id: 'happiness',
    name: 'Happiness',
    icon: '😊',
    description: 'User satisfaction with the feature (requires survey)',
    measurementTypes: [
      { value: 'survey_score', label: 'Survey Score (1-5 rating)' },
      { value: 'nps_score', label: 'Net Promoter Score (NPS)' },
    ],
    requiresSurvey: true,
  },
  {
    id: 'engagement',
    name: 'Engagement',
    icon: '📊',
    description: 'How frequently and deeply users engage with the feature',
    measurementTypes: [
      { value: 'events_per_user', label: 'Events per User (total)' },
      { value: 'events_per_user_per_week', label: 'Events per User per Week' },
    ],
  },
  {
    id: 'adoption',
    name: 'Adoption',
    icon: '🚀',
    description: 'Percentage of eligible users who have tried the feature',
    measurementTypes: [
      { value: 'unique_users_percentage', label: 'Unique Users (% of eligible)' },
      { value: 'unique_users_count', label: 'Unique Users (count)' },
      { value: 'unique_companies_count', label: 'Unique Companies (count)' },
    ],
  },
  {
    id: 'retention',
    name: 'Retention',
    icon: '🔄',
    description: 'Whether users return to use the feature again',
    measurementTypes: [
      { value: 'return_rate_7_days', label: 'Return Rate (7 days)' },
      { value: 'return_rate_14_days', label: 'Return Rate (14 days)' },
      { value: 'return_rate_30_days', label: 'Return Rate (30 days)' },
    ],
  },
  {
    id: 'task_success',
    name: 'Task Success',
    icon: '✅',
    description: 'Whether users complete key workflows successfully',
    measurementTypes: [
      { value: 'completion_rate', label: 'Completion Rate (completions / starts)' },
      { value: 'success_rate', label: 'Success Rate (successes / attempts)' },
    ],
  },
];

interface MilestoneFormData {
  days: number;
  target: number;
  label: string;
}

interface MetricFormData {
  category: HeartCategoryId;
  existingMetricId: string | null; // Track if this is an existing metric for updates
  name: string;
  measurementType: HeartMeasurementType | null;
  pendoEventIds: string[];
  pendoSegmentId: string | null;
  targetValue: number | null;
  targetTimeframeDays: number | null;
  description: string;
  milestones: MilestoneFormData[];
}

// Default milestone presets
const DEFAULT_MILESTONES: MilestoneFormData[] = [
  { days: 30, target: 30, label: '1 Month' },
  { days: 90, target: 60, label: '3 Months' },
  { days: 180, target: 80, label: '6 Months' },
];

export function HeartManualConfigForm({
  epicId,
  configId,
  existingMetrics = [],
  onSave,
  onCancel,
}: HeartManualConfigFormProps) {
  const [pendoEvents, setPendoEvents] = useState<Array<{ value: string; label: string }>>([]);
  const [pendoSegments, setPendoSegments] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingPendo, setLoadingPendo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<HeartCategoryId>('engagement');
  
  // Track which categories have been configured
  const [configuredCategories, setConfiguredCategories] = useState<Set<HeartCategoryId>>(
    () => new Set(existingMetrics.map(m => m.heart_category).filter((c): c is HeartCategoryId => c != null))
  );
  
  // Current form data for each category
  const [formData, setFormData] = useState<Record<HeartCategoryId, MetricFormData>>(() => {
    const initial: Record<string, MetricFormData> = {};
    for (const cat of HEART_CATEGORIES) {
      const existing = existingMetrics.find(m => m.heart_category === cat.id);
      // Convert existing milestones or use single target as one milestone
      let milestones: MilestoneFormData[] = [];
      if (existing?.milestones && existing.milestones.length > 0) {
        milestones = existing.milestones.map(m => ({
          days: m.days_after_launch,
          target: m.target_value,
          label: m.label || `Day ${m.days_after_launch}`,
        }));
      } else if (existing?.target_value && existing?.target_timeframe_days) {
        // Legacy single target - convert to milestone
        milestones = [{
          days: existing.target_timeframe_days,
          target: existing.target_value,
          label: existing.target_timeframe_days <= 30 ? '1 Month' : 
                 existing.target_timeframe_days <= 90 ? '3 Months' : 
                 `${existing.target_timeframe_days} Days`,
        }];
      }
      
      initial[cat.id] = {
        category: cat.id,
        existingMetricId: existing?.id || null,
        name: existing?.name || `${cat.name} Metric`,
        measurementType: existing?.measurement_type || cat.measurementTypes[0].value,
        pendoEventIds: existing?.pendo_event_ids || [],
        pendoSegmentId: existing?.pendo_segment_id || null,
        targetValue: existing?.target_value || null,
        targetTimeframeDays: existing?.target_timeframe_days || null,
        description: existing?.description || '',
        milestones,
      };
    }
    return initial as Record<HeartCategoryId, MetricFormData>;
  });

  // Separate lists for events, features, and segments
  const [pendoFeatures, setPendoFeatures] = useState<Array<{ value: string; label: string; kind: string }>>([]);
  // Map of Pendo IDs/names to display labels (for showing names instead of cryptic IDs)
  const [pendoIdToLabel, setPendoIdToLabel] = useState<Record<string, string>>({});

  // Fetch Pendo events, features, and segments
  useEffect(() => {
    const fetchPendoData = async () => {
      setLoadingPendo(true);
      try {
        const [eventsRes, featuresRes, segmentsRes] = await Promise.all([
          fetch('/api/settings/success-measurement/pendo/events?activeOnly=true&days=14'),
          fetch('/api/settings/success-measurement/pendo/features?activeOnly=true&days=14'),
          fetch('/api/settings/success-measurement/pendo/segments?activeOnly=true&days=14'),
        ]);

        const idToLabel: Record<string, string> = {};

        // Process events (Track Events - custom pendo.track() calls)
        if (eventsRes.ok) {
          const data = await eventsRes.json();
          if (data.events && Array.isArray(data.events)) {
            const eventOptions = data.events
              .filter((e: any) => e && e.name)
              .map((e: any) => {
                const label = e.name + (e.productArea ? ` [${e.productArea}]` : '');
                idToLabel[e.name] = e.name;
                return {
                  value: e.name,
                  label,
                };
              });
            setPendoEvents(eventOptions);
          }
        }

        // Process features (Tagged UI elements - clicks/views tracked automatically)
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

        setPendoIdToLabel(idToLabel);

        // Process segments (User cohorts for filtering)
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
      } catch (err) {
        console.error('Error fetching Pendo data:', err);
      } finally {
        setLoadingPendo(false);
      }
    };

    fetchPendoData();
  }, []);

  const updateFormData = (category: HeartCategoryId, updates: Partial<MetricFormData>) => {
    setFormData(prev => ({
      ...prev,
      [category]: { ...prev[category], ...updates },
    }));
  };

  const toggleCategory = (category: HeartCategoryId, enabled: boolean) => {
    setConfiguredCategories(prev => {
      const next = new Set(prev);
      if (enabled) {
        next.add(category);
      } else {
        next.delete(category);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Get categories to save (ones that are enabled and have events selected, or happiness)
      const categoriesToSave = HEART_CATEGORIES.filter(cat => {
        if (!configuredCategories.has(cat.id)) return false;
        if (cat.requiresSurvey) return false; // Skip happiness for now
        const data = formData[cat.id];
        return data.pendoEventIds.length > 0;
      });

      if (categoriesToSave.length === 0) {
        setError('Please configure at least one metric with Pendo events selected.');
        setSaving(false);
        return;
      }

      // Validate milestones (at least 1, max 3)
      for (const cat of categoriesToSave) {
        const data = formData[cat.id];
        if (data.milestones.length === 0) {
          setError(`${cat.name} requires at least 1 milestone target.`);
          setSaving(false);
          return;
        }
        if (data.milestones.length > 3) {
          setError(`${cat.name} can have at most 3 milestone targets.`);
          setSaving(false);
          return;
        }
      }

      let created = 0;
      let updated = 0;

      // Create or update metrics for each configured category
      for (const cat of categoriesToSave) {
        const data = formData[cat.id];
        const isUpdate = !!data.existingMetricId;
        
        // For legacy compatibility: use first milestone as target_value/timeframe if milestones exist
        const primaryMilestone = data.milestones.length > 0 ? data.milestones[0] : null;
        
        const url = isUpdate 
          ? `/api/epics/${epicId}/heart/metrics/${data.existingMetricId}`
          : `/api/epics/${epicId}/heart/metrics`;
        
        const res = await fetch(url, {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            heart_category: cat.id,
            name: data.name,
            description: data.description || null,
            measurement_type: data.measurementType,
            pendo_event_ids: data.pendoEventIds,
            pendo_segment_id: data.pendoSegmentId,
            // Use first milestone for legacy single-target fields
            target_value: primaryMilestone?.target ?? data.targetValue,
            target_timeframe_days: primaryMilestone?.days ?? data.targetTimeframeDays,
            // Include full milestones array
            milestones: data.milestones.map(m => ({
              days_after_launch: m.days,
              target_value: m.target,
              label: m.label,
            })),
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Failed to ${isUpdate ? 'update' : 'create'} ${cat.name} metric`);
        }
        
        if (isUpdate) {
          updated++;
        } else {
          created++;
        }
      }

      const messages = [];
      if (created > 0) messages.push(`${created} created`);
      if (updated > 0) messages.push(`${updated} updated`);

      notifications.show({
        title: 'Metrics Saved',
        message: `HEART metrics: ${messages.join(', ')}.`,
        color: 'green',
      });

      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingPendo) {
    return (
      <Card withBorder padding="lg">
        <Stack align="center" gap="md" py="xl">
          <Loader size="lg" />
          <Text>Loading Pendo data...</Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder padding="lg">
      <Stack gap="lg">
        <div>
          <Text size="lg" fw={600}>Configure HEART Metrics</Text>
          <Text size="sm" c="dimmed">
            Select Pendo events for each HEART category you want to track.
          </Text>
        </div>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
            {error}
          </Alert>
        )}

        {pendoEvents.length === 0 && (
          <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="No Pendo Events">
            No Pendo events found. Please ensure your Pendo integration is configured in Settings.
          </Alert>
        )}

        <Tabs value={activeCategory} onChange={(value) => setActiveCategory(value as HeartCategoryId)}>
          <Tabs.List>
            {HEART_CATEGORIES.map((cat) => (
              <Tabs.Tab key={cat.id} value={cat.id}>
                {cat.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        <Accordion variant="separated" multiple defaultValue={[activeCategory]}>
          {HEART_CATEGORIES.filter((cat) => cat.id === activeCategory).map((cat) => {
            const isConfigured = configuredCategories.has(cat.id);
            const data = formData[cat.id];

            return (
              <Accordion.Item key={cat.id} value={cat.id} id={`heart-edit-${cat.id}`}>
                <Accordion.Control>
                  <Group gap="sm">
                    <Text size="xl">{cat.icon}</Text>
                    <div>
                      <Group gap="xs">
                        <Text fw={500}>{cat.name}</Text>
                        {isConfigured && data.pendoEventIds.length > 0 && (
                          <Badge size="xs" color="green">Configured</Badge>
                        )}
                        {cat.requiresSurvey && (
                          <Badge size="xs" color="yellow" variant="light">Survey Required</Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">{cat.description}</Text>
                    </div>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  {cat.requiresSurvey ? (
                    <Paper p="md" bg="gray.0">
                      <Text size="sm" c="dimmed">
                        Happiness metrics require a survey to be created and approved by CS.
                        This feature is coming soon.
                      </Text>
                    </Paper>
                  ) : (
                    <Stack gap="md">
                      {/* Data Source Selection */}
                      <Paper withBorder p="sm" bg="gray.0">
                        <Text size="sm" fw={500} mb="xs">What to Track</Text>
                        <Text size="xs" c="dimmed" mb="md">
                          Choose Track Events (custom code events) OR Features (tagged UI elements). 
                          You can select multiple of the same type.
                        </Text>
                        
                        <Stack gap="sm">
                          <MultiSelect
                            label={
                              <Group gap={4}>
                                <Text size="sm">📊 Track Events</Text>
                                <Text size="xs" c="dimmed">(custom pendo.track() calls)</Text>
                              </Group>
                            }
                            description="Events fired by your code when specific actions happen"
                            placeholder="Search track events..."
                            data={pendoEvents}
                            value={data.pendoEventIds.filter(id => 
                              pendoEvents.some(e => e.value === id)
                            )}
                            onChange={(value) => {
                              // Merge with any selected features
                              const featureIds = data.pendoEventIds.filter(id => 
                                pendoFeatures.some(f => f.value === id)
                              );
                              updateFormData(cat.id, { pendoEventIds: [...value, ...featureIds] });
                              if (value.length > 0 || featureIds.length > 0) {
                                toggleCategory(cat.id, true);
                              }
                            }}
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
                            description="Clicks/views on tagged buttons, pages, or UI elements"
                            placeholder="Search tagged features..."
                            data={pendoFeatures.map(f => ({
                              value: f.value,
                              label: `${f.kind === 'Page' ? '📄' : '✨'} ${f.label} (${f.kind})`,
                            }))}
                            value={data.pendoEventIds.filter(id => 
                              pendoFeatures.some(f => f.value === id)
                            )}
                            onChange={(value) => {
                              // Merge with any selected events
                              const eventIds = data.pendoEventIds.filter(id => 
                                pendoEvents.some(e => e.value === id)
                              );
                              updateFormData(cat.id, { pendoEventIds: [...eventIds, ...value] });
                              if (value.length > 0 || eventIds.length > 0) {
                                toggleCategory(cat.id, true);
                              }
                            }}
                            searchable
                            clearable
                            maxDropdownHeight={200}
                          />
                        </Stack>
                        
                        {data.pendoEventIds.length > 0 && (
                          <Text size="xs" c="green" mt="sm">
                            ✓ Tracking {data.pendoEventIds.length} item(s)
                          </Text>
                        )}
                      </Paper>

                      <Select
                        label="Measurement Type"
                        description="How should this metric be calculated?"
                        data={cat.measurementTypes}
                        value={data.measurementType}
                        onChange={(value) => updateFormData(cat.id, { 
                          measurementType: value as HeartMeasurementType 
                        })}
                      />

                      {/* Segment filter - available for all metrics, not just adoption */}
                      <Select
                        label="👥 User Segment (Optional)"
                        description="Filter to a specific cohort of users (e.g., Enterprise, New Users)"
                        placeholder="All users"
                        data={pendoSegments}
                        value={data.pendoSegmentId}
                        onChange={(value) => updateFormData(cat.id, { pendoSegmentId: value })}
                        clearable
                        searchable
                      />

                      <Divider label="Milestone Targets" labelPosition="left" />
                      
                      <Text size="xs" c="dimmed" mb="xs">
                        Set targets at different time horizons (e.g., 30% at 1 month, 60% at 3 months)
                      </Text>

                      {/* Milestone list */}
                      {data.milestones.length > 0 ? (
                        <Stack gap="xs">
                          {data.milestones.map((milestone, idx) => {
                            // Auto-generate label from days
                            const autoLabel = milestone.days <= 30 ? '1 Month' :
                              milestone.days <= 60 ? '2 Months' :
                              milestone.days <= 90 ? '3 Months' :
                              milestone.days <= 120 ? '4 Months' :
                              milestone.days <= 150 ? '5 Months' :
                              milestone.days <= 180 ? '6 Months' :
                              milestone.days <= 270 ? '9 Months' :
                              milestone.days <= 365 ? '1 Year' :
                              `${Math.round(milestone.days / 30)} Months`;
                            
                            return (
                              <Paper key={idx} withBorder p="xs" bg="gray.0">
                                <Group gap="xs">
                                  <NumberInput
                                    size="xs"
                                    placeholder="Days"
                                    value={milestone.days}
                                    onChange={(value) => {
                                      const days = typeof value === 'number' ? value : 30;
                                      const newLabel = days <= 30 ? '1 Month' :
                                        days <= 60 ? '2 Months' :
                                        days <= 90 ? '3 Months' :
                                        days <= 120 ? '4 Months' :
                                        days <= 150 ? '5 Months' :
                                        days <= 180 ? '6 Months' :
                                        days <= 270 ? '9 Months' :
                                        days <= 365 ? '1 Year' :
                                        `${Math.round(days / 30)} Months`;
                                      const newMilestones = [...data.milestones];
                                      newMilestones[idx] = { ...milestone, days, label: newLabel };
                                      updateFormData(cat.id, { milestones: newMilestones });
                                    }}
                                    min={1}
                                    max={365}
                                    style={{ width: 70 }}
                                  />
                                  <Text size="xs" c="dimmed">days →</Text>
                                  <NumberInput
                                    size="xs"
                                    placeholder="Target"
                                    value={milestone.target}
                                    onChange={(value) => {
                                      const newMilestones = [...data.milestones];
                                      newMilestones[idx] = { ...milestone, target: typeof value === 'number' ? value : 50 };
                                      updateFormData(cat.id, { milestones: newMilestones });
                                    }}
                                    min={0}
                                    max={100}
                                    style={{ width: 70 }}
                                  />
                                  <Text size="xs" c="dimmed">%</Text>
                                  <Badge size="xs" variant="light" color="blue">
                                    {autoLabel}
                                  </Badge>
                                  {data.milestones.length > 1 && (
                                    <Button
                                      size="xs"
                                      variant="subtle"
                                      color="red"
                                      onClick={() => {
                                        const newMilestones = data.milestones.filter((_, i) => i !== idx);
                                        updateFormData(cat.id, { milestones: newMilestones });
                                      }}
                                      style={{ marginLeft: 'auto' }}
                                    >
                                      Remove
                                    </Button>
                                  )}
                                </Group>
                              </Paper>
                            );
                          })}
                        </Stack>
                      ) : (
                        <Text size="xs" c="dimmed" ta="center" py="xs">
                          No milestones set. Add milestones or use defaults.
                        </Text>
                      )}

                      {/* Add milestone buttons */}
                      <Group gap="xs" mt="xs">
                        {data.milestones.length < 3 && (
                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconPlus size={14} />}
                            onClick={() => {
                              const lastDay = data.milestones.length > 0 
                                ? Math.max(...data.milestones.map(m => m.days)) + 30 
                                : 30;
                              const newMilestones = [...data.milestones, { 
                                days: lastDay, 
                                target: 50, 
                                label: `Day ${lastDay}` 
                              }];
                              updateFormData(cat.id, { milestones: newMilestones });
                            }}
                          >
                            Add Milestone
                          </Button>
                        )}
                        {data.milestones.length === 0 && (
                          <Button
                            size="xs"
                            variant="light"
                            color="blue"
                            onClick={() => {
                              updateFormData(cat.id, { milestones: [...DEFAULT_MILESTONES] });
                            }}
                          >
                            Use Defaults (30/90/180 days)
                          </Button>
                        )}
                        <Text size="xs" c="dimmed">
                          {data.milestones.length}/3 milestones {data.milestones.length === 0 && '(at least 1 required)'}
                        </Text>
                      </Group>

                      <Textarea
                        label="Description (Optional)"
                        description="Notes about why this metric matters"
                        placeholder="This metric tracks..."
                        value={data.description}
                        onChange={(e) => updateFormData(cat.id, { description: e.target.value })}
                        autosize
                        minRows={2}
                      />
                    </Stack>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            loading={saving}
            disabled={pendoEvents.length === 0}
          >
            Save Metrics
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
