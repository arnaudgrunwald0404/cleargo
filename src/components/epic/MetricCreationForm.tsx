"use client";

import React, { useState } from 'react';
import { TextInput, Select, Textarea, Button, Stack, Group, Text, Alert, Divider, NumberInput, Modal, useCombobox } from '@mantine/core';
import { IconSparkles, IconInfoCircle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type {
  CreateSuccessMetricDTO,
  MetricCategory,
  MeasurementType,
  MetricSource,
  LeadingOrLagging,
  MetricThresholds,
} from '@/lib/success/types';

interface MetricCreationFormProps {
  epicId: string;
  epicTier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  opened: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function MetricCreationForm({
  epicId,
  epicTier,
  opened,
  onClose,
  onSuccess,
}: MetricCreationFormProps) {
  const [formData, setFormData] = useState<CreateSuccessMetricDTO>({
    name: '',
    category: 'ADOPTION',
    description: null,
    measurement_type: 'PERCENTAGE',
    source: 'MANUAL',
    pendo_event_id: null,
    leading_or_lagging: 'LAGGING',
    thresholds: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [naturalLanguageDescription, setNaturalLanguageDescription] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pendoEvents, setPendoEvents] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingPendoEvents, setLoadingPendoEvents] = useState(false);
  const [pendoError, setPendoError] = useState<string | null>(null);
  const [pendoSearchValue, setPendoSearchValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasFetchedPendoEvents = React.useRef(false);
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setPendoSearchValue('');
    },
  });

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    // Validate thresholds - if provided, at least one tier must have at least one value
    if (formData.thresholds) {
      const hasThresholds = ['TIER_1', 'TIER_2', 'TIER_3'].some((tier) => {
        const tierThresholds = formData.thresholds![tier as keyof MetricThresholds];
        return tierThresholds.min !== undefined || tierThresholds.max !== undefined || tierThresholds.target !== undefined;
      });

      if (!hasThresholds) {
        newErrors.thresholds = 'If thresholds are provided, at least one tier must have a threshold value (min, max, or target)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleParseDescription = async () => {
    if (!naturalLanguageDescription.trim()) return;

    setIsParsing(true);
    setParseError(null);

    try {
      const res = await fetch('/api/settings/success-measurement/metrics/parse-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: naturalLanguageDescription }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to parse description');
      }

      const { metric } = await res.json();
      
      // Update form with parsed data
      setFormData({
        name: metric.name || formData.name,
        category: metric.category || formData.category,
        description: metric.description || formData.description,
        measurement_type: metric.measurement_type || formData.measurement_type,
        source: metric.source || formData.source,
        pendo_event_id: metric.pendo_event_id || formData.pendo_event_id,
        leading_or_lagging: metric.leading_or_lagging || formData.leading_or_lagging,
        thresholds: metric.thresholds || formData.thresholds,
      });

      notifications.show({
        title: 'Success',
        message: 'Description parsed successfully',
        color: 'green',
      });
    } catch (error: any) {
      setParseError(error.message || 'Failed to parse description');
    } finally {
      setIsParsing(false);
    }
  };

  const updateThreshold = (
    tier: 'TIER_1' | 'TIER_2' | 'TIER_3',
    field: 'min' | 'max' | 'target',
    value: number | undefined
  ) => {
    setFormData({
      ...formData,
      thresholds: {
        ...formData.thresholds,
        [tier]: {
          ...formData.thresholds?.[tier],
          [field]: value,
        },
      } as MetricThresholds,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Create the metric globally (epic-specific config is handled elsewhere)
      const metricRes = await fetch('/api/settings/success-measurement/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!metricRes.ok) {
        const errorData = await metricRes.json();
        throw new Error(errorData.error || 'Failed to create metric');
      }

      notifications.show({
        title: 'Success',
        message: 'Metric created',
        color: 'green',
      });

      // Reset form
      setFormData({
        name: '',
        category: 'ADOPTION',
        description: null,
        measurement_type: 'PERCENTAGE',
        source: 'MANUAL',
        pendo_event_id: null,
        leading_or_lagging: 'LAGGING',
        thresholds: null,
      });
      setNaturalLanguageDescription('');
      setErrors({});

      await onSuccess();
      onClose();
    } catch (error: any) {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to create metric',
        color: 'red',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // (Pendo events for epic-specific config are now handled in the epic configuration form)

  // Reset form when modal closes
  React.useEffect(() => {
    if (!opened) {
      setFormData({
        name: '',
        category: 'ADOPTION',
        description: null,
        measurement_type: 'PERCENTAGE',
        source: 'MANUAL',
        pendo_event_id: null,
        leading_or_lagging: 'LAGGING',
        thresholds: null,
      });
      setNaturalLanguageDescription('');
      setErrors({});
      hasFetchedPendoEvents.current = false;
    }
  }, [opened]);

  return (
    <Modal opened={opened} onClose={onClose} title="Create Metric" size="lg">
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <Alert icon={<IconInfoCircle size={16} />} color="blue" title="Quick Start">
            Describe your metric in plain English, and we'll automatically fill in the form fields for you.
          </Alert>
          
          <Textarea
            label="Describe your metric"
            placeholder="e.g., 'I want to track the percentage of users who complete onboarding within 7 days. This is an adoption metric from Pendo event ID abc123. Target is 80% for tier 1.'"
            value={naturalLanguageDescription}
            onChange={(e) => {
              setNaturalLanguageDescription(e.target.value);
              setParseError(null);
            }}
            minRows={4}
            error={parseError}
          />
          
          <Group justify="flex-end">
            <Button
              type="button"
              leftSection={<IconSparkles size={16} />}
              onClick={handleParseDescription}
              loading={isParsing}
              disabled={!naturalLanguageDescription.trim()}
              variant="light"
            >
              Parse Description
            </Button>
          </Group>

          <Divider label="Or fill in manually" labelPosition="center" />

          <TextInput
            label="Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={errors.name}
          />

          <Select
            label="Category"
            required
            data={[
              { value: 'ADOPTION', label: 'Adoption' },
              { value: 'REVENUE', label: 'Revenue' },
              { value: 'RETENTION', label: 'Retention' },
              { value: 'ENABLEMENT', label: 'Enablement' },
              { value: 'FRICTION', label: 'Friction' },
            ]}
            value={formData.category}
            onChange={(value) => setFormData({ ...formData, category: value as MetricCategory })}
          />

          <Textarea
            label="Description"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
            minRows={3}
          />

          <Select
            label="Measurement Type"
            required
            data={[
              { value: 'PERCENTAGE', label: 'Percentage' },
              { value: 'COUNT', label: 'Count' },
              { value: 'DURATION', label: 'Duration' },
              { value: 'BOOLEAN', label: 'Boolean' },
            ]}
            value={formData.measurement_type}
            onChange={(value) => setFormData({ ...formData, measurement_type: value as MeasurementType })}
          />

          <Select
            label="Source"
            required
            data={[
              { value: 'PENDO', label: 'Pendo' },
              { value: 'SNOWFLAKE', label: 'Snowflake' },
              { value: 'MANUAL', label: 'Manual' },
            ]}
            value={formData.source}
            onChange={(value) => {
              setFormData({
                ...formData,
                source: value as MetricSource,
              });
            }}
          />

          <Select
            label="Leading or Lagging"
            required
            data={[
              { value: 'LEADING', label: 'Leading' },
              { value: 'LAGGING', label: 'Lagging' },
            ]}
            value={formData.leading_or_lagging}
            onChange={(value) => setFormData({ ...formData, leading_or_lagging: value as LeadingOrLagging })}
          />

          <Divider label="Thresholds by Tier (Optional)" labelPosition="center" />

          <div>
            <Text size="sm" fw={500} mb="xs">
              Configure default thresholds by tier for this metric
            </Text>
            {errors.thresholds && <Text size="xs" c="red" mb="xs">{errors.thresholds}</Text>}
            
            {(['TIER_1', 'TIER_2', 'TIER_3'] as const).map((tier) => (
              <div key={tier} style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
                <Text size="sm" fw={500} mb="xs">{tier.replace('_', ' ')}</Text>
                <Group gap="xs">
                  <NumberInput
                    label="Min"
                    value={formData.thresholds?.[tier]?.min}
                    onChange={(value) => updateThreshold(tier, 'min', value ? Number(value) : undefined)}
                    style={{ flex: 1 }}
                  />
                  <NumberInput
                    label="Target"
                    value={formData.thresholds?.[tier]?.target}
                    onChange={(value) => updateThreshold(tier, 'target', value ? Number(value) : undefined)}
                    style={{ flex: 1 }}
                  />
                  <NumberInput
                    label="Max"
                    value={formData.thresholds?.[tier]?.max}
                    onChange={(value) => updateThreshold(tier, 'max', value ? Number(value) : undefined)}
                    style={{ flex: 1 }}
                  />
                </Group>
              </div>
            ))}
          </div>

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Create Metric & Add to Epic
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
