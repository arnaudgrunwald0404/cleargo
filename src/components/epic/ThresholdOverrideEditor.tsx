"use client";

import React, { useState } from 'react';
import {
  Modal,
  Button,
  Stack,
  Group,
  NumberInput,
  Text,
} from '@mantine/core';
import type { MetricThresholds } from '@/lib/success/types';

interface ThresholdOverrideEditorProps {
  opened: boolean;
  onClose: () => void;
  initialThresholds?: MetricThresholds | null;
  onSubmit: (thresholds: MetricThresholds | null) => Promise<void>;
  isSubmitting?: boolean;
}

export function ThresholdOverrideEditor({
  opened,
  onClose,
  initialThresholds,
  onSubmit,
  isSubmitting = false,
}: ThresholdOverrideEditorProps) {
  const [thresholds, setThresholds] = useState<MetricThresholds>({
    TIER_1: initialThresholds?.TIER_1 || {},
    TIER_2: initialThresholds?.TIER_2 || {},
    TIER_3: initialThresholds?.TIER_3 || {},
  });

  const updateThreshold = (
    tier: 'TIER_1' | 'TIER_2' | 'TIER_3',
    field: 'min' | 'max' | 'target',
    value: number | undefined
  ) => {
    setThresholds({
      ...thresholds,
      [tier]: {
        ...thresholds[tier],
        [field]: value,
      },
    });
  };

  const handleSubmit = async () => {
    // Check if at least one tier has at least one value
    const hasAnyValue = ['TIER_1', 'TIER_2', 'TIER_3'].some((tier) => {
      const tierThresholds = thresholds[tier as keyof MetricThresholds];
      return tierThresholds.min !== undefined || tierThresholds.max !== undefined || tierThresholds.target !== undefined;
    });

    if (!hasAnyValue) {
      alert('At least one tier must have a threshold value (min, max, or target)');
      return;
    }

    try {
      await onSubmit(thresholds);
      onClose();
    } catch (error: any) {
      console.error('Error submitting thresholds:', error);
    }
  };

  const handleClear = () => {
    setThresholds({
      TIER_1: {},
      TIER_2: {},
      TIER_3: {},
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit Threshold Override"
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Override default thresholds for this metric. Leave fields empty to use default thresholds.
        </Text>

        {(['TIER_1', 'TIER_2', 'TIER_3'] as const).map((tier) => (
          <div key={tier} style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
            <Text size="sm" fw={500} mb="xs">{tier.replace('_', ' ')}</Text>
            <Group gap="xs">
              <NumberInput
                label="Min"
                value={thresholds[tier].min}
                onChange={(value) => updateThreshold(tier, 'min', value ? Number(value) : undefined)}
                style={{ flex: 1 }}
              />
              <NumberInput
                label="Target"
                value={thresholds[tier].target}
                onChange={(value) => updateThreshold(tier, 'target', value ? Number(value) : undefined)}
                style={{ flex: 1 }}
              />
              <NumberInput
                label="Max"
                value={thresholds[tier].max}
                onChange={(value) => updateThreshold(tier, 'max', value ? Number(value) : undefined)}
                style={{ flex: 1 }}
              />
            </Group>
          </div>
        ))}

        <Group justify="space-between" mt="md">
          <Button variant="subtle" color="red" onClick={handleClear} disabled={isSubmitting}>
            Clear All
          </Button>
          <Group>
            <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={isSubmitting}>
              Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

