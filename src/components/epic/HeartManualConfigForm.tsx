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
  TextInput,
  Autocomplete,
  Badge,
  Accordion,
  Loader,
  Alert,
  Divider,
  Tabs,
  SegmentedControl,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconPlus, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { HeartCategoryId, HeartMeasurementType, HeartDataSource, EpicHeartMetric } from '@/lib/heart/types';

interface HeartManualConfigFormProps {
  epicId: string;
  configId: string;
  existingMetrics?: EpicHeartMetric[];
  onSave: () => void;
  onCancel: () => void | Promise<void>;
}

/** Shown in measurement dropdowns — values entered outside Pendo (same as admin Success Metrics settings). */
const NON_PENDO_MEASUREMENT_OPTIONS: Array<{ value: HeartMeasurementType; label: string }> = [
  { value: 'manual_numeric', label: 'Custom — manual numeric (not from Pendo)' },
  { value: 'manual_percentage', label: 'Custom — manual % (not from Pendo)' },
];

// HEART category definitions
const HEART_CATEGORIES: Array<{
  id: HeartCategoryId;
  name: string;
  icon: string;
  description: string;
  pendoMeasurementTypes: Array<{ value: HeartMeasurementType; label: string }>;
  manualPlaceholder: string;
  requiresSurvey?: boolean;
}> = [
  {
    id: 'happiness',
    name: 'Happiness',
    icon: '😊',
    description: 'User satisfaction — combines frustration signals (rage clicks, dead clicks, u-turns) with optional survey data',
    pendoMeasurementTypes: [
      { value: 'happiness_composite_score', label: 'Composite Score (frustration health + optional survey)' },
      { value: 'survey_score', label: 'Survey Score (1-5 rating)' },
      { value: 'nps_score', label: 'Net Promoter Score (NPS)' },
      ...NON_PENDO_MEASUREMENT_OPTIONS,
    ],
    manualPlaceholder: 'e.g., NPS Score, CSAT Rating, Frustration Score',
  },
  {
    id: 'engagement',
    name: 'Engagement',
    icon: '📊',
    description: 'How frequently and deeply users engage with the feature',
    pendoMeasurementTypes: [
      { value: 'events_per_user', label: 'Events per User (total)' },
      { value: 'events_per_user_per_week', label: 'Events per User per Week' },
      ...NON_PENDO_MEASUREMENT_OPTIONS,
    ],
    manualPlaceholder: 'e.g., Sessions per User, Weekly Active Users, Feature Interactions',
  },
  {
    id: 'adoption',
    name: 'Adoption',
    icon: '🚀',
    description: 'Percentage of eligible users who have tried the feature',
    pendoMeasurementTypes: [
      { value: 'unique_users_percentage', label: 'Unique Users (% of eligible)' },
      { value: 'unique_users_count', label: 'Unique Users (count)' },
      { value: 'unique_companies_count', label: 'Unique Companies (count)' },
      ...NON_PENDO_MEASUREMENT_OPTIONS,
    ],
    manualPlaceholder: 'e.g., Unique Companies Count, Adoption Rate %, Users Activated',
  },
  {
    id: 'retention',
    name: 'Retention',
    icon: '🔄',
    description: 'Whether users return to use the feature again',
    pendoMeasurementTypes: [
      { value: 'return_rate_7_days', label: 'Return Rate (7 days)' },
      { value: 'return_rate_14_days', label: 'Return Rate (14 days)' },
      { value: 'return_rate_30_days', label: 'Return Rate (30 days)' },
      ...NON_PENDO_MEASUREMENT_OPTIONS,
    ],
    manualPlaceholder: 'e.g., 30-Day Return Rate, Monthly Retention %, Churn Rate',
  },
  {
    id: 'task_success',
    name: 'Task Success',
    icon: '✅',
    description: 'Whether users complete key workflows successfully',
    pendoMeasurementTypes: [
      { value: 'completion_rate', label: 'Completion Rate (completions / starts)' },
      { value: 'success_rate', label: 'Success Rate (successes / attempts)' },
      ...NON_PENDO_MEASUREMENT_OPTIONS,
    ],
    manualPlaceholder: 'e.g., Completion Rate, Success Rate %, Error Rate',
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
  dataSource: HeartDataSource;
  name: string;
  measurementType: string; // Pendo types use predefined values; manual uses free text
  pendoEventIds: string[];
  pendoSegmentId: string | null;
  targetValue: number | null;
  targetTimeframeDays: number | null;
  targetUnit: string; // e.g. '%', 'Users', 'Organizations', 'Score'
  description: string;
  milestones: MilestoneFormData[];
}

interface CustomMetricFormData {
  metricId: string; // existing metric ID from DB
  name: string;
  categoryLabel: string;
  icon: string;
  measurementType: string;
  targetUnit: string;
  description: string;
  milestones: MilestoneFormData[];
  deleted: boolean; // track if user wants to delete this metric
}

// Default milestone presets
const DEFAULT_MILESTONES: MilestoneFormData[] = [
  { days: 30, target: 30, label: '1 Month' },
  { days: 90, target: 60, label: '3 Months' },
  { days: 180, target: 80, label: '6 Months' },
];

/**
 * Determine data source from an existing metric's measurement_type and pendo_event_ids
 */
function inferDataSource(metric: EpicHeartMetric): HeartDataSource {
  if (metric.measurement_type === 'manual_numeric' || metric.measurement_type === 'manual_percentage') {
    return 'manual';
  }
  if (!metric.pendo_event_ids || metric.pendo_event_ids.length === 0) {
    return 'manual';
  }
  return 'pendo';
}

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
  const [pendoAvailable, setPendoAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<HeartCategoryId | 'custom'>('engagement');
  
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
        dataSource: existing ? inferDataSource(existing) : 'manual',
        name: existing?.name || `${cat.name} Metric`,
        measurementType: existing?.measurement_type || '',
        pendoEventIds: existing?.pendo_event_ids || [],
        pendoSegmentId: existing?.pendo_segment_id || null,
        targetValue: existing?.target_value || null,
        targetTimeframeDays: existing?.target_timeframe_days || null,
        targetUnit: existing?.target_unit || (existing ? inferDataSource(existing) === 'pendo' ? '%' : '' : ''),
        description: existing?.description || '',
        milestones,
      };
    }
    return initial as Record<HeartCategoryId, MetricFormData>;
  });

  // Custom (standalone) metrics form data
  const [customMetrics, setCustomMetrics] = useState<CustomMetricFormData[]>(() => {
    return existingMetrics
      .filter(m => m.is_custom && !m.heart_category)
      .map(m => {
        let milestones: MilestoneFormData[] = [];
        if (m.milestones && m.milestones.length > 0) {
          milestones = m.milestones.map(ms => ({
            days: ms.days_after_launch,
            target: ms.target_value,
            label: ms.label || `Day ${ms.days_after_launch}`,
          }));
        } else if (m.target_value && m.target_timeframe_days) {
          milestones = [{
            days: m.target_timeframe_days,
            target: m.target_value,
            label: m.target_timeframe_days <= 30 ? '1 Month' :
                   m.target_timeframe_days <= 90 ? '3 Months' :
                   `${m.target_timeframe_days} Days`,
          }];
        }
        return {
          metricId: m.id,
          name: m.name,
          categoryLabel: m.custom_category_label || 'Custom',
          icon: m.custom_icon || '📊',
          measurementType: m.measurement_type || '',
          targetUnit: m.target_unit || '',
          description: m.description || '',
          milestones,
          deleted: false,
        };
      });
  });

  // Separate lists for events, features, pages, and segments
  const [pendoFeatures, setPendoFeatures] = useState<Array<{ value: string; label: string; kind: string }>>([]);
  const [pendoPages, setPendoPages] = useState<Array<{ value: string; label: string }>>([]);
  // Map of Pendo IDs/names to display labels (for showing names instead of cryptic IDs)
  const [pendoIdToLabel, setPendoIdToLabel] = useState<Record<string, string>>({});

  // Fetch Pendo events, features, and segments (non-blocking)
  useEffect(() => {
    const fetchPendoData = async () => {
      setLoadingPendo(true);
      try {
        const [eventsRes, featuresRes, pagesRes, segmentsRes] = await Promise.all([
          fetch('/api/settings/success-measurement/pendo/events?activeOnly=false'),
          fetch('/api/settings/success-measurement/pendo/features?activeOnly=false'),
          fetch('/api/settings/success-measurement/pendo/pages'),
          fetch('/api/settings/success-measurement/pendo/segments?activeOnly=false'),
        ]);

        const idToLabel: Record<string, string> = {};
        let hasAnyData = false;

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
            if (eventOptions.length > 0) hasAnyData = true;
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
            if (featureOptions.length > 0) hasAnyData = true;
          }
        }

        // Process pages (Product screens / URL patterns)
        if (pagesRes.ok) {
          const data = await pagesRes.json();
          if (data.pages && Array.isArray(data.pages)) {
            const pageOptions = data.pages
              .filter((p: any) => p && p.id && p.name)
              .map((p: any) => {
                idToLabel[p.id] = p.name;
                return { value: p.id, label: p.name };
              });
            setPendoPages(pageOptions);
            if (pageOptions.length > 0) hasAnyData = true;
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

        setPendoAvailable(hasAnyData);
      } catch (err) {
        console.error('Error fetching Pendo data:', err);
        setPendoAvailable(false);
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

  const updateCustomMetric = (index: number, updates: Partial<CustomMetricFormData>) => {
    setCustomMetrics(prev => prev.map((m, i) => i === index ? { ...m, ...updates } : m));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Get categories to save (ones that are enabled and have valid config)
      const categoriesToSave = HEART_CATEGORIES.filter(cat => {
        if (!configuredCategories.has(cat.id)) return false;
        if (cat.requiresSurvey) return false; // Skip happiness for now
        const data = formData[cat.id];
        
        // Pendo source needs events selected
        if (data.dataSource === 'pendo') {
          return data.pendoEventIds.length > 0;
        }
        // Manual source needs a measurement type description and name
        return !!data.measurementType.trim() && !!data.name.trim();
      });

      // Check custom metrics that need saving (not deleted, have valid data)
      const customToSave = customMetrics.filter(m => !m.deleted && !!m.name.trim() && !!m.measurementType.trim());
      const customToDelete = customMetrics.filter(m => m.deleted);

      if (categoriesToSave.length === 0 && customToSave.length === 0 && customToDelete.length === 0) {
        setError('Please configure at least one metric category. For Pendo metrics, select events. For manual metrics, set a name and measurement type.');
        setSaving(false);
        return;
      }

      // Validate milestones (at least 1, max 3) for HEART categories
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

      // Validate milestones for custom metrics
      for (const cm of customToSave) {
        if (cm.milestones.length === 0) {
          setError(`Custom metric "${cm.name}" requires at least 1 milestone target.`);
          setSaving(false);
          return;
        }
        if (cm.milestones.length > 3) {
          setError(`Custom metric "${cm.name}" can have at most 3 milestone targets.`);
          setSaving(false);
          return;
        }
      }

      let created = 0;
      let updated = 0;
      let deleted = 0;

      // Create or update metrics for each configured HEART category
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
            data_source: data.dataSource,
            name: data.name,
            description: data.description || null,
            measurement_type: data.measurementType,
            pendo_event_ids: data.dataSource === 'pendo' ? data.pendoEventIds : [],
            pendo_segment_id: data.dataSource === 'pendo' ? data.pendoSegmentId : null,
            // Use first milestone for legacy single-target fields
            target_value: primaryMilestone?.target ?? data.targetValue,
            target_timeframe_days: primaryMilestone?.days ?? data.targetTimeframeDays,
            target_unit: data.dataSource === 'pendo' ? '%' : (data.targetUnit || null),
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

      // Save custom metrics (all are updates since they already exist)
      for (const cm of customToSave) {
        const primaryMilestone = cm.milestones.length > 0 ? cm.milestones[0] : null;
        
        const res = await fetch(`/api/epics/${epicId}/heart/metrics/${cm.metricId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: cm.name,
            description: cm.description || null,
            measurement_type: cm.measurementType,
            target_value: primaryMilestone?.target ?? null,
            target_timeframe_days: primaryMilestone?.days ?? null,
            target_unit: cm.targetUnit || null,
            custom_category_label: cm.categoryLabel,
            custom_icon: cm.icon,
            milestones: cm.milestones.map(m => ({
              days_after_launch: m.days,
              target_value: m.target,
              label: m.label,
            })),
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Failed to update custom metric "${cm.name}"`);
        }
        updated++;
      }

      // Delete custom metrics marked for deletion
      for (const cm of customToDelete) {
        const res = await fetch(`/api/epics/${epicId}/heart/metrics/${cm.metricId}`, {
          method: 'DELETE',
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Failed to delete custom metric "${cm.name}"`);
        }
        deleted++;
      }

      const messages = [];
      if (created > 0) messages.push(`${created} created`);
      if (updated > 0) messages.push(`${updated} updated`);
      if (deleted > 0) messages.push(`${deleted} deleted`);

      notifications.show({
        title: 'Metrics Saved',
        message: `Metrics: ${messages.join(', ')}.`,
        color: 'green',
      });

      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Check if any configured category or custom metric has valid data to save
  const hasValidHeartConfig = HEART_CATEGORIES.some(cat => {
    if (!configuredCategories.has(cat.id)) return false;
    if (cat.requiresSurvey) return false;
    const data = formData[cat.id];
    if (data.dataSource === 'pendo') return data.pendoEventIds.length > 0;
    return !!data.measurementType.trim() && !!data.name.trim();
  });
  const hasCustomChanges = customMetrics.some(m => !m.deleted && !!m.name.trim() && !!m.measurementType.trim())
    || customMetrics.some(m => m.deleted);
  const hasValidConfig = hasValidHeartConfig || hasCustomChanges;

  return (
    <Card withBorder padding="lg">
      <Stack gap="lg">
        <div>
          <Text size="lg" fw={600}>Configure Metrics</Text>
          <Text size="sm" c="dimmed">
            Set up HEART category metrics using Pendo events or manual entry, and manage any custom metrics you&apos;ve added.
          </Text>
        </div>

        {/* Show what we're currently tracking so users can see and edit existing config */}
        {existingMetrics.length > 0 && (
          <Paper p="md" withBorder bg="gray.0">
            <Text size="sm" fw={600} mb="xs">What we&apos;re tracking</Text>
            <Text size="xs" c="dimmed" mb="xs">
              Use the tabs below to change events or targets for each category.
            </Text>
            <Stack gap={4}>
              {HEART_CATEGORIES.filter((cat) => {
                const m = existingMetrics.find((em) => em.heart_category === cat.id);
                return m && (m.pendo_event_ids?.length ?? 0) > 0;
              }).map((cat) => {
                const m = existingMetrics.find((em) => em.heart_category === cat.id)!;
                const labels = (m.pendo_event_ids || []).map((id) => pendoIdToLabel[id] ?? id);
                const summary = labels.length <= 2 ? labels.join(', ') : `${labels[0]}, ${labels[1]} and ${labels.length - 2} more`;
                return (
                  <Group key={cat.id} gap="xs">
                    <Text size="xs" fw={500}>{cat.icon} {cat.name}:</Text>
                    <Text size="xs" c="dimmed">{summary}</Text>
                  </Group>
                );
              })}
              {existingMetrics.some((m) => m.is_custom) && (
                <Text size="xs" c="dimmed">Custom metrics: see Custom tab.</Text>
              )}
            </Stack>
          </Paper>
        )}

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
            {error}
          </Alert>
        )}

        {!loadingPendo && !pendoAvailable && (
          <Alert icon={<IconAlertCircle size={16} />} color="blue" title="Pendo Not Connected">
            No Pendo events found. You can still configure metrics using <strong>Manual Entry</strong> for 
            data you track outside Pendo. To use Pendo-sourced metrics, configure your Pendo integration in Settings.
          </Alert>
        )}

        <Tabs value={activeCategory} onChange={(value) => setActiveCategory(value as HeartCategoryId | 'custom')}>
          <Tabs.List>
            {HEART_CATEGORIES.map((cat) => (
              <Tabs.Tab key={cat.id} value={cat.id}>
                {cat.name}
              </Tabs.Tab>
            ))}
            {customMetrics.length > 0 && (
              <Tabs.Tab value="custom">
                ✨ Custom ({customMetrics.filter(m => !m.deleted).length})
              </Tabs.Tab>
            )}
          </Tabs.List>
        </Tabs>

        {activeCategory === 'custom' ? (
          /* ========= CUSTOM METRICS TAB ========= */
          <Stack gap="md">
            {customMetrics.filter(m => !m.deleted).length === 0 ? (
              <Paper p="lg" withBorder>
                <Text size="sm" c="dimmed" ta="center">
                  All custom metrics have been marked for deletion. Save to confirm, or cancel to keep them.
                </Text>
              </Paper>
            ) : (
              <Accordion variant="separated" multiple defaultValue={customMetrics.filter(m => !m.deleted).map((_, i) => `custom-${i}`)}>
                {customMetrics.map((cm, idx) => {
                  if (cm.deleted) return null;
                  return (
                    <Accordion.Item key={cm.metricId} value={`custom-${idx}`}>
                      <Accordion.Control>
                        <Group gap="sm">
                          <Text size="xl">{cm.icon}</Text>
                          <div>
                            <Group gap="xs">
                              <Text fw={500}>{cm.name || 'Unnamed Custom Metric'}</Text>
                              <Badge size="xs" color="violet" variant="light">{cm.categoryLabel}</Badge>
                              <Badge size="xs" color="blue" variant="light">Manual</Badge>
                            </Group>
                            <Text size="xs" c="dimmed">{cm.measurementType || 'No measurement type set'}</Text>
                          </div>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Stack gap="md">
                          <Group gap="sm">
                            <TextInput
                              label="Metric Name"
                              placeholder="e.g., Revenue Impact"
                              value={cm.name}
                              onChange={(e) => updateCustomMetric(idx, { name: e.currentTarget.value })}
                              required
                              style={{ flex: 1 }}
                            />
                            <TextInput
                              label="Category Label"
                              placeholder="e.g., Revenue"
                              value={cm.categoryLabel}
                              onChange={(e) => updateCustomMetric(idx, { categoryLabel: e.currentTarget.value })}
                              style={{ width: 160 }}
                            />
                            <TextInput
                              label="Icon"
                              placeholder="📊"
                              value={cm.icon}
                              onChange={(e) => updateCustomMetric(idx, { icon: e.currentTarget.value })}
                              style={{ width: 70 }}
                            />
                          </Group>

                          <TextInput
                            label="What are you measuring?"
                            description="Describe the metric type (e.g., Monthly Recurring Revenue, NPS Score)"
                            placeholder="e.g., Monthly Recurring Revenue"
                            value={cm.measurementType}
                            onChange={(e) => updateCustomMetric(idx, { measurementType: e.currentTarget.value })}
                            required
                          />

                          <Autocomplete
                            label="Target Unit"
                            description="What unit are you tracking?"
                            placeholder="e.g., $, %, Users, Score"
                            data={['%', '$', 'Users', 'Organizations', 'Companies', 'Count', 'Score', 'Points', 'Responses']}
                            value={cm.targetUnit}
                            onChange={(value) => updateCustomMetric(idx, { targetUnit: value })}
                          />

                          <Divider label="Milestone Targets" labelPosition="left" />
                          
                          <Text size="xs" c="dimmed" mb="xs">
                            Set target values at different time horizons
                          </Text>

                          {cm.milestones.length > 0 ? (
                            <Stack gap="xs">
                              {cm.milestones.map((milestone, mIdx) => {
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
                                  <Paper key={mIdx} withBorder p="xs" bg="gray.0">
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
                                          const newMilestones = [...cm.milestones];
                                          newMilestones[mIdx] = { ...milestone, days, label: newLabel };
                                          updateCustomMetric(idx, { milestones: newMilestones });
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
                                          const newMilestones = [...cm.milestones];
                                          newMilestones[mIdx] = { ...milestone, target: typeof value === 'number' ? value : 0 };
                                          updateCustomMetric(idx, { milestones: newMilestones });
                                        }}
                                        min={0}
                                        style={{ width: 90 }}
                                      />
                                      {cm.targetUnit && (
                                        <Text size="xs" c="dimmed">{cm.targetUnit}</Text>
                                      )}
                                      <Badge size="xs" variant="light" color="blue">
                                        {autoLabel}
                                      </Badge>
                                      {cm.milestones.length > 1 && (
                                        <Button
                                          size="xs"
                                          variant="subtle"
                                          color="red"
                                          onClick={() => {
                                            const newMilestones = cm.milestones.filter((_, i) => i !== mIdx);
                                            updateCustomMetric(idx, { milestones: newMilestones });
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
                              No milestones set. Add at least 1 milestone.
                            </Text>
                          )}

                          <Group gap="xs" mt="xs">
                            {cm.milestones.length < 3 && (
                              <Button
                                size="xs"
                                variant="light"
                                leftSection={<IconPlus size={14} />}
                                onClick={() => {
                                  const lastDay = cm.milestones.length > 0
                                    ? Math.max(...cm.milestones.map(m => m.days)) + 30
                                    : 30;
                                  const newMilestones = [...cm.milestones, {
                                    days: lastDay,
                                    target: 0,
                                    label: `Day ${lastDay}`,
                                  }];
                                  updateCustomMetric(idx, { milestones: newMilestones });
                                }}
                              >
                                Add Milestone
                              </Button>
                            )}
                            <Text size="xs" c="dimmed">
                              {cm.milestones.length}/3 milestones {cm.milestones.length === 0 && '(at least 1 required)'}
                            </Text>
                          </Group>

                          <Textarea
                            label="Description (Optional)"
                            description="Describe what this metric tracks and where the data comes from"
                            placeholder="e.g., Monthly revenue impact tracked from Salesforce..."
                            value={cm.description}
                            onChange={(e) => updateCustomMetric(idx, { description: e.target.value })}
                            autosize
                            minRows={2}
                          />

                          <Divider />

                          <Button
                            size="xs"
                            variant="light"
                            color="red"
                            leftSection={<IconTrash size={14} />}
                            onClick={() => updateCustomMetric(idx, { deleted: true })}
                          >
                            Delete this custom metric
                          </Button>
                        </Stack>
                      </Accordion.Panel>
                    </Accordion.Item>
                  );
                })}
              </Accordion>
            )}

            {/* Show deleted metrics with undo option */}
            {customMetrics.some(m => m.deleted) && (
              <Paper p="sm" withBorder bg="red.0" style={{ borderColor: 'var(--mantine-color-red-3)' }}>
                <Stack gap="xs">
                  <Text size="sm" fw={500} c="red.8">Metrics marked for deletion:</Text>
                  {customMetrics.filter(m => m.deleted).map((cm, idx) => {
                    const realIdx = customMetrics.indexOf(cm);
                    return (
                      <Group key={cm.metricId} gap="xs">
                        <Text size="sm" c="red.7" style={{ textDecoration: 'line-through' }}>
                          {cm.icon} {cm.name}
                        </Text>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="blue"
                          onClick={() => updateCustomMetric(realIdx, { deleted: false })}
                        >
                          Undo
                        </Button>
                      </Group>
                    );
                  })}
                  <Text size="xs" c="dimmed">These will be permanently deleted when you save.</Text>
                </Stack>
              </Paper>
            )}
          </Stack>
        ) : (
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
                        {isConfigured && (data.dataSource === 'manual' ? !!data.measurementType : data.pendoEventIds.length > 0) && (
                          <Badge size="xs" color="green">Configured</Badge>
                        )}
                        {isConfigured && data.dataSource === 'manual' && (
                          <Badge size="xs" color="blue" variant="light">Manual</Badge>
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
                        <Text size="sm" fw={500} mb="xs">Data Source</Text>
                        <Text size="xs" c="dimmed" mb="sm">
                          Choose where the data for this metric comes from.
                        </Text>
                        <SegmentedControl
                          value={data.dataSource}
                          onChange={(value) => {
                            const newSource = value as HeartDataSource;
                            const catDef = HEART_CATEGORIES.find(c => c.id === cat.id)!;
                            // Reset measurement type when switching data source
                            const newMeasurementType = newSource === 'pendo'
                              ? catDef.pendoMeasurementTypes.filter(
                                  (m) => m.value !== 'manual_numeric' && m.value !== 'manual_percentage'
                                )[0]?.value || ''
                              : 'manual_numeric'; // Custom / non-Pendo default
                            updateFormData(cat.id, { 
                              dataSource: newSource,
                              measurementType: newMeasurementType,
                              targetUnit: newSource === 'pendo' ? '%' : '',
                              // Clear Pendo-specific data when switching to manual
                              ...(newSource === 'manual' ? { pendoEventIds: [], pendoSegmentId: null } : {}),
                            });
                            if (newSource === 'manual') {
                              toggleCategory(cat.id, true);
                            }
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

                      {data.dataSource === 'pendo' ? (
                        /* ========= PENDO DATA SOURCE ========= */
                        <>
                          <Paper withBorder p="sm" bg="gray.0">
                            <Text size="sm" fw={500} mb="xs">What to Track</Text>
                            <Text size="xs" c="dimmed" mb="md">
                              Choose Track Events (custom code events) OR Features (tagged UI elements). 
                              You can select multiple of the same type.
                            </Text>
                            
                            {loadingPendo ? (
                              <Group gap="xs" py="md" justify="center">
                                <Loader size="sm" />
                                <Text size="sm" c="dimmed">Loading Pendo events...</Text>
                              </Group>
                            ) : (
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
                                    const featureIds = data.pendoEventIds.filter(id => pendoFeatures.some(f => f.value === id));
                                    const pageIds = data.pendoEventIds.filter(id => pendoPages.some(p => p.value === id));
                                    updateFormData(cat.id, { pendoEventIds: [...value, ...featureIds, ...pageIds] });
                                    if (value.length > 0 || featureIds.length > 0 || pageIds.length > 0) {
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
                                  description="Clicks/views on tagged buttons or UI elements"
                                  placeholder="Search tagged features..."
                                  data={pendoFeatures.map(f => ({
                                    value: f.value,
                                    label: f.label,
                                  }))}
                                  value={data.pendoEventIds.filter(id => 
                                    pendoFeatures.some(f => f.value === id)
                                  )}
                                  onChange={(value) => {
                                    const eventIds = data.pendoEventIds.filter(id => pendoEvents.some(e => e.value === id));
                                    const pageIds = data.pendoEventIds.filter(id => pendoPages.some(p => p.value === id));
                                    updateFormData(cat.id, { pendoEventIds: [...eventIds, ...value, ...pageIds] });
                                    if (eventIds.length > 0 || value.length > 0 || pageIds.length > 0) {
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
                                      <Text size="sm">📄 Pages</Text>
                                      <Text size="xs" c="dimmed">(product screens / URL patterns)</Text>
                                    </Group>
                                  }
                                  description="Page views tracked by Pendo on specific screens"
                                  placeholder="Search pages..."
                                  data={pendoPages}
                                  value={data.pendoEventIds.filter(id => 
                                    pendoPages.some(p => p.value === id)
                                  )}
                                  onChange={(value) => {
                                    const eventIds = data.pendoEventIds.filter(id => pendoEvents.some(e => e.value === id));
                                    const featureIds = data.pendoEventIds.filter(id => pendoFeatures.some(f => f.value === id));
                                    updateFormData(cat.id, { pendoEventIds: [...eventIds, ...featureIds, ...value] });
                                    if (eventIds.length > 0 || featureIds.length > 0 || value.length > 0) {
                                      toggleCategory(cat.id, true);
                                    }
                                  }}
                                  searchable
                                  clearable
                                  maxDropdownHeight={200}
                                />
                              </Stack>
                            )}
                            
                            {data.pendoEventIds.length > 0 && (
                              <Text size="xs" c="green" mt="sm">
                                ✓ Tracking {data.pendoEventIds.length} item(s)
                              </Text>
                            )}
                          </Paper>

                          <Select
                            label="Measurement Type"
                            description="Pendo types use analytics below. Custom (manual) types switch to manual entry — no Pendo events required."
                            data={cat.pendoMeasurementTypes}
                            value={data.measurementType || null}
                            onChange={(value) => {
                              const v = value || '';
                              const isCustomManual = v === 'manual_numeric' || v === 'manual_percentage';
                              if (isCustomManual) {
                                updateFormData(cat.id, {
                                  measurementType: v,
                                  dataSource: 'manual',
                                  pendoEventIds: [],
                                  pendoSegmentId: null,
                                });
                              } else {
                                updateFormData(cat.id, { measurementType: v });
                              }
                            }}
                          />

                          {/* Segment filter - available for Pendo metrics */}
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
                        </>
                      ) : (
                        /* ========= MANUAL DATA SOURCE ========= */
                        <>
                          <Paper withBorder p="sm" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderColor: 'var(--mantine-color-blue-2)' }}>
                            <Text size="sm" fw={500} mb="xs">Manual Entry Metric</Text>
                            <Text size="xs" c="gray.7">
                              You'll record values for this metric manually over time. Use this for data from 
                              external systems, spreadsheets, surveys, or any source outside Pendo.
                            </Text>
                          </Paper>

                          <Select
                            label="Measurement type"
                            description="Choose a custom type when the data is not in Pendo. Numeric = counts, amounts, etc. Percentage = rates or % targets."
                            placeholder="Select measurement type"
                            data={NON_PENDO_MEASUREMENT_OPTIONS}
                            value={
                              data.measurementType === 'manual_numeric' || data.measurementType === 'manual_percentage'
                                ? data.measurementType
                                : null
                            }
                            onChange={(value) =>
                              updateFormData(cat.id, { measurementType: value || '' })
                            }
                            required
                          />
                          {data.measurementType &&
                            data.measurementType !== 'manual_numeric' &&
                            data.measurementType !== 'manual_percentage' && (
                              <TextInput
                                label="Custom measurement label (legacy)"
                                description="This metric used a free-text type. Replace by choosing an option above, or keep and edit."
                                placeholder={cat.manualPlaceholder}
                                value={data.measurementType}
                                onChange={(e) =>
                                  updateFormData(cat.id, { measurementType: e.currentTarget.value })
                                }
                              />
                            )}

                          <Autocomplete
                            label="Target Unit"
                            description="What unit are you tracking? Type your own or pick a suggestion."
                            placeholder="e.g., %, Users, Organizations, Score"
                            data={['%', 'Users', 'Organizations', 'Companies', 'Count', 'Score', 'Points', 'Responses']}
                            value={data.targetUnit}
                            onChange={(value) => updateFormData(cat.id, { targetUnit: value })}
                          />
                        </>
                      )}

                      <Divider label="Milestone Targets" labelPosition="left" />
                      
                      <Text size="xs" c="dimmed" mb="xs">
                        {data.dataSource === 'manual'
                          ? 'Set target values at different time horizons (e.g., 50 companies at 1 month, 200 at 3 months)'
                          : 'Set targets at different time horizons (e.g., 30% at 1 month, 60% at 3 months)'}
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
                                    // No max for manual - could be count, score, etc.
                                    {...(data.dataSource === 'pendo' ? { max: 100 } : {})}
                                    style={{ width: data.dataSource === 'manual' ? 90 : 70 }}
                                  />
                                  {(data.dataSource === 'pendo' || data.targetUnit) && (
                                    <Text size="xs" c="dimmed">{data.dataSource === 'pendo' ? '%' : data.targetUnit}</Text>
                                  )}
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
                                target: data.dataSource === 'pendo' ? 50 : 0, 
                                label: `Day ${lastDay}` 
                              }];
                              updateFormData(cat.id, { milestones: newMilestones });
                            }}
                          >
                            Add Milestone
                          </Button>
                        )}
                        {data.milestones.length === 0 && data.dataSource === 'pendo' && (
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
                        description={data.dataSource === 'manual' 
                          ? "Describe what this metric tracks and where the data comes from"
                          : "Notes about why this metric matters"}
                        placeholder={data.dataSource === 'manual'
                          ? "e.g., Adoption rate from our internal analytics dashboard, updated weekly..."
                          : "This metric tracks..."}
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
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            loading={saving}
            disabled={!hasValidConfig}
          >
            Save Metrics
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
