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
  const [thresholds, setThresholds] = useState<MetricThresholds>(
    initialThresholds || {}
  );

  const updateThreshold = (
    field: 'min' | 'max' | 'target',
    value: number | undefined
  ) => {
    setThresholds({
      ...thresholds,
      [field]: value,
    });
  };

  const handleSubmit = async () => {
    const hasAnyValue =
      thresholds.min !== undefined ||
      thresholds.max !== undefined ||
      thresholds.target !== undefined;

    try {
      await onSubmit(hasAnyValue ? thresholds : null);
      onClose();
    } catch (error: any) {
      console.error('Error submitting thresholds:', error);
    }
  };

  const handleClear = () => {
    setThresholds({});
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
          Override default thresholds for this metric. Leave all fields empty to
          use default thresholds.
        </Text>

        <Group gap="xs">
          <NumberInput
            label="Min"
            value={thresholds.min}
            onChange={(value) =>
              updateThreshold('min', value ? Number(value) : undefined)
            }
            style={{ flex: 1 }}
          />
          <NumberInput
            label="Target"
            value={thresholds.target}
            onChange={(value) =>
              updateThreshold('target', value ? Number(value) : undefined)
            }
            style={{ flex: 1 }}
          />
          <NumberInput
            label="Max"
            value={thresholds.max}
            onChange={(value) =>
              updateThreshold('max', value ? Number(value) : undefined)
            }
            style={{ flex: 1 }}
          />
        </Group>

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

