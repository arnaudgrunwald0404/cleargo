"use client";

import React, { useState } from 'react';
import {
  TextInput,
  Select,
  Textarea,
  Button,
  Stack,
  Group,
  NumberInput,
  Text,
} from '@mantine/core';
import type {
  CreateSuccessMetricDTO,
  MetricCategory,
  MeasurementType,
  MetricSource,
  LeadingOrLagging,
  MetricThresholds,
} from '@/lib/success/types';

interface MetricFormProps {
  initialData?: Partial<CreateSuccessMetricDTO>;
  onSubmit: (data: CreateSuccessMetricDTO) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function MetricForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: MetricFormProps) {
  const [formData, setFormData] = useState<CreateSuccessMetricDTO>({
    name: initialData?.name || '',
    category: initialData?.category || 'ADOPTION',
    description: initialData?.description || null,
    measurement_type: initialData?.measurement_type || 'PERCENTAGE',
    source: initialData?.source || 'MANUAL',
    pendo_event_id: initialData?.pendo_event_id || null,
    leading_or_lagging: initialData?.leading_or_lagging || 'LAGGING',
    thresholds: initialData?.thresholds || {
      TIER_1: {},
      TIER_2: {},
      TIER_3: {},
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (formData.source === 'PENDO' && !formData.pendo_event_id?.trim()) {
      newErrors.pendo_event_id = 'Pendo event ID is required when source is PENDO';
    }

    // Validate thresholds - at least one tier must have at least one value
    const hasThresholds = ['TIER_1', 'TIER_2', 'TIER_3'].some((tier) => {
      const tierThresholds = formData.thresholds[tier as keyof MetricThresholds];
      return tierThresholds.min !== undefined || tierThresholds.max !== undefined || tierThresholds.target !== undefined;
    });

    if (!hasThresholds) {
      newErrors.thresholds = 'At least one tier must have a threshold value (min, max, or target)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      return;
    }

    try {
      await onSubmit(formData);
    } catch (error: any) {
      console.error('Error submitting metric:', error);
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
          ...formData.thresholds[tier],
          [field]: value,
        },
      },
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
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
              pendo_event_id: value === 'PENDO' ? formData.pendo_event_id : null,
            });
          }}
        />

        {formData.source === 'PENDO' && (
          <TextInput
            label="Pendo Event ID"
            required
            value={formData.pendo_event_id || ''}
            onChange={(e) => setFormData({ ...formData, pendo_event_id: e.target.value || null })}
            error={errors.pendo_event_id}
          />
        )}

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

        <div>
          <Text size="sm" fw={500} mb="xs">
            Thresholds by Tier
          </Text>
          {errors.thresholds && <Text size="xs" c="red" mb="xs">{errors.thresholds}</Text>}
          
          {(['TIER_1', 'TIER_2', 'TIER_3'] as const).map((tier) => (
            <div key={tier} style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
              <Text size="sm" fw={500} mb="xs">{tier.replace('_', ' ')}</Text>
              <Group gap="xs">
                <NumberInput
                  label="Min"
                  value={formData.thresholds[tier].min}
                  onChange={(value) => updateThreshold(tier, 'min', value ? Number(value) : undefined)}
                  style={{ flex: 1 }}
                />
                <NumberInput
                  label="Target"
                  value={formData.thresholds[tier].target}
                  onChange={(value) => updateThreshold(tier, 'target', value ? Number(value) : undefined)}
                  style={{ flex: 1 }}
                />
                <NumberInput
                  label="Max"
                  value={formData.thresholds[tier].max}
                  onChange={(value) => updateThreshold(tier, 'max', value ? Number(value) : undefined)}
                  style={{ flex: 1 }}
                />
              </Group>
            </div>
          ))}
        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {initialData ? 'Update' : 'Create'} Metric
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

