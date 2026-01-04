"use client";

import React, { useState, useEffect } from 'react';
import {
  TextInput,
  Select,
  NumberInput,
  Button,
  Stack,
  Group,
  Textarea,
  ActionIcon,
  Text,
  Checkbox,
  JsonInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { CreateAdoptionBenchmarkDTO, LaunchTier } from '@/lib/success/types';

interface BenchmarkFormProps {
  initialData?: Partial<CreateAdoptionBenchmarkDTO>;
  onSubmit: (data: CreateAdoptionBenchmarkDTO) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function BenchmarkForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: BenchmarkFormProps) {
  const [formData, setFormData] = useState<CreateAdoptionBenchmarkDTO>({
    name: initialData?.name || '',
    launch_tier: initialData?.launch_tier || 'TIER_1',
    feature_type: initialData?.feature_type || '',
    target_persona: initialData?.target_persona || '',
    horizon_days: initialData?.horizon_days || [30],
    expected_activation: initialData?.expected_activation || [0.2],
    expected_usage_depth: initialData?.expected_usage_depth || null,
    expected_ttfv_days: initialData?.expected_ttfv_days || null,
    segment_modifiers: initialData?.segment_modifiers || null,
    is_default: initialData?.is_default || false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.feature_type.trim()) {
      newErrors.feature_type = 'Feature type is required';
    }
    if (!formData.target_persona.trim()) {
      newErrors.target_persona = 'Target persona is required';
    }
    if (formData.horizon_days.length === 0) {
      newErrors.horizon_days = 'At least one horizon day is required';
    }
    if (formData.expected_activation.length === 0) {
      newErrors.expected_activation = 'At least one expected activation value is required';
    }
    if (formData.horizon_days.length !== formData.expected_activation.length) {
      newErrors.expected_activation = 'Horizon days and expected activation arrays must have the same length';
    }
    if (
      formData.expected_usage_depth &&
      formData.expected_usage_depth.length !== formData.horizon_days.length
    ) {
      newErrors.expected_usage_depth = 'Expected usage depth must have the same length as horizon days';
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
      console.error('Error submitting benchmark:', error);
    }
  };

  const addHorizonEntry = () => {
    const lastDay = formData.horizon_days[formData.horizon_days.length - 1] || 30;
    const lastActivation = formData.expected_activation[formData.expected_activation.length - 1] || 0.2;
    setFormData({
      ...formData,
      horizon_days: [...formData.horizon_days, lastDay + 30],
      expected_activation: [...formData.expected_activation, lastActivation],
      expected_usage_depth: formData.expected_usage_depth
        ? [...formData.expected_usage_depth, formData.expected_usage_depth[formData.expected_usage_depth.length - 1] || 0.1]
        : null,
    });
  };

  const removeHorizonEntry = (index: number) => {
    if (formData.horizon_days.length <= 1) return;
    const newHorizonDays = formData.horizon_days.filter((_, i) => i !== index);
    const newExpectedActivation = formData.expected_activation.filter((_, i) => i !== index);
    const newExpectedUsageDepth = formData.expected_usage_depth
      ? formData.expected_usage_depth.filter((_, i) => i !== index)
      : null;
    setFormData({
      ...formData,
      horizon_days: newHorizonDays,
      expected_activation: newExpectedActivation,
      expected_usage_depth: newExpectedUsageDepth,
    });
  };

  const updateHorizonEntry = (index: number, field: 'horizon_days' | 'expected_activation' | 'expected_usage_depth', value: number) => {
    if (field === 'horizon_days') {
      const newHorizonDays = [...formData.horizon_days];
      newHorizonDays[index] = value;
      setFormData({ ...formData, horizon_days: newHorizonDays });
    } else if (field === 'expected_activation') {
      const newExpectedActivation = [...formData.expected_activation];
      newExpectedActivation[index] = value;
      setFormData({ ...formData, expected_activation: newExpectedActivation });
    } else if (field === 'expected_usage_depth') {
      const newExpectedUsageDepth = formData.expected_usage_depth ? [...formData.expected_usage_depth] : [];
      newExpectedUsageDepth[index] = value;
      setFormData({ ...formData, expected_usage_depth: newExpectedUsageDepth });
    }
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
          label="Launch Tier"
          required
          data={[
            { value: 'TIER_1', label: 'Tier 1' },
            { value: 'TIER_2', label: 'Tier 2' },
            { value: 'TIER_3', label: 'Tier 3' },
          ]}
          value={formData.launch_tier}
          onChange={(value) => setFormData({ ...formData, launch_tier: value as LaunchTier })}
        />

        <TextInput
          label="Feature Type"
          required
          value={formData.feature_type}
          onChange={(e) => setFormData({ ...formData, feature_type: e.target.value })}
          error={errors.feature_type}
        />

        <TextInput
          label="Target Persona"
          required
          value={formData.target_persona}
          onChange={(e) => setFormData({ ...formData, target_persona: e.target.value })}
          error={errors.target_persona}
        />

        <div>
          <Text size="sm" fw={500} mb="xs">
            Horizon Days & Expected Activation
          </Text>
          {formData.horizon_days.map((day, index) => (
            <Group key={index} gap="xs" mb="xs" align="flex-start">
              <NumberInput
                label="Days"
                value={day}
                onChange={(value) => updateHorizonEntry(index, 'horizon_days', Number(value) || 0)}
                min={1}
                style={{ flex: 1 }}
              />
              <NumberInput
                label="Activation %"
                value={formData.expected_activation[index]}
                onChange={(value) => updateHorizonEntry(index, 'expected_activation', Number(value) || 0)}
                min={0}
                max={1}
                step={0.01}
                decimalScale={2}
                style={{ flex: 1 }}
              />
              {formData.expected_usage_depth && (
                <NumberInput
                  label="Usage Depth %"
                  value={formData.expected_usage_depth[index]}
                  onChange={(value) => updateHorizonEntry(index, 'expected_usage_depth', Number(value) || 0)}
                  min={0}
                  max={1}
                  step={0.01}
                  decimalScale={2}
                  style={{ flex: 1 }}
                />
              )}
              {formData.horizon_days.length > 1 && (
                <ActionIcon
                  color="red"
                  variant="light"
                  onClick={() => removeHorizonEntry(index)}
                  mt="xl"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              )}
            </Group>
          ))}
          {errors.horizon_days && <Text size="xs" c="red">{errors.horizon_days}</Text>}
          {errors.expected_activation && <Text size="xs" c="red">{errors.expected_activation}</Text>}
          {errors.expected_usage_depth && <Text size="xs" c="red">{errors.expected_usage_depth}</Text>}
          <Button
            leftSection={<IconPlus size={16} />}
            variant="light"
            size="xs"
            onClick={addHorizonEntry}
            mt="xs"
          >
            Add Horizon Entry
          </Button>
        </div>

        <Checkbox
          label="Include Expected Usage Depth"
          checked={formData.expected_usage_depth !== null}
          onChange={(e) => {
            if (e.currentTarget.checked) {
              setFormData({
                ...formData,
                expected_usage_depth: formData.horizon_days.map(() => 0.1),
              });
            } else {
              setFormData({ ...formData, expected_usage_depth: null });
            }
          }}
        />

        <NumberInput
          label="Expected Time to First Value (Days)"
          value={formData.expected_ttfv_days || undefined}
          onChange={(value) => setFormData({ ...formData, expected_ttfv_days: value ? Number(value) : null })}
          min={1}
        />

        <div>
          <Text size="sm" fw={500} mb="xs">
            Segment Modifiers (JSON)
          </Text>
          <JsonInput
            value={formData.segment_modifiers ? JSON.stringify(formData.segment_modifiers, null, 2) : ''}
            onChange={(value) => {
              try {
                const parsed = value ? JSON.parse(value) : null;
                setFormData({ ...formData, segment_modifiers: parsed });
              } catch {
                // Invalid JSON, ignore
              }
            }}
            formatOnBlur
            autosize
            minRows={4}
          />
        </div>

        <Checkbox
          label="Set as Default"
          checked={formData.is_default}
          onChange={(e) => setFormData({ ...formData, is_default: e.currentTarget.checked })}
        />

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {initialData ? 'Update' : 'Create'} Benchmark
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

