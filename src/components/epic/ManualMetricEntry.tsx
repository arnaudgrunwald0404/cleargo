"use client";

import React, { useState } from 'react';
import {
  Modal,
  Button,
  Stack,
  TextInput,
  NumberInput,
  Checkbox,
  Group,
  Text,
  Alert,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import type { SuccessMetric, MeasurementType } from '@/lib/success/types';

interface ManualMetricEntryProps {
  opened: boolean;
  onClose: () => void;
  epicId: string;
  metric: SuccessMetric;
  snapshotDate?: string;
  initialValue?: number | boolean | null;
  onSubmit: (value: number | boolean, snapshotDate: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function ManualMetricEntry({
  opened,
  onClose,
  epicId,
  metric,
  snapshotDate: initialSnapshotDate,
  initialValue,
  onSubmit,
  isSubmitting = false,
}: ManualMetricEntryProps) {
  const [snapshotDate, setSnapshotDate] = useState(
    initialSnapshotDate || new Date().toISOString().split('T')[0]
  );
  const [value, setValue] = useState<number | boolean | null>(initialValue || null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (value === null || value === undefined) {
      setError('Value is required');
      return;
    }

    try {
      await onSubmit(value, snapshotDate);
      onClose();
      setValue(null);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save value');
    }
  };

  const renderInput = () => {
    switch (metric.measurement_type) {
      case 'PERCENTAGE':
        return (
          <NumberInput
            label="Value (%)"
            description="Enter percentage value (0-100)"
            value={typeof value === 'number' ? value : undefined}
            onChange={(val) => setValue(typeof val === 'number' ? val : null)}
            min={0}
            max={100}
            decimalScale={2}
            required
          />
        );
      case 'COUNT':
        return (
          <NumberInput
            label="Value"
            description="Enter count value"
            value={typeof value === 'number' ? value : undefined}
            onChange={(val) => setValue(typeof val === 'number' ? val : null)}
            min={0}
            required
          />
        );
      case 'DURATION':
        return (
          <NumberInput
            label="Value (days)"
            description="Enter duration in days"
            value={typeof value === 'number' ? value : undefined}
            onChange={(val) => setValue(typeof val === 'number' ? val : null)}
            min={0}
            decimalScale={2}
            required
          />
        );
      case 'BOOLEAN':
        return (
          <Checkbox
            label="Value"
            description="Check if condition is met"
            checked={typeof value === 'boolean' ? value : false}
            onChange={(e) => setValue(e.currentTarget.checked)}
          />
        );
      default:
        return <Text c="red">Unsupported measurement type</Text>;
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Enter Manual Value: ${metric.name}`}
      size="md"
    >
      <Stack gap="md">
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
            {error}
          </Alert>
        )}

        <TextInput
          label="Snapshot Date"
          type="date"
          value={snapshotDate}
          onChange={(e) => setSnapshotDate(e.target.value)}
          required
        />

        {renderInput()}

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={isSubmitting}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

