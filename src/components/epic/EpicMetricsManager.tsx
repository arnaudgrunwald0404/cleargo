"use client";

import React, { useState } from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Button,
  Badge,
  ActionIcon,
  Alert,
} from '@mantine/core';
import { IconPlus, IconTrash, IconEdit, IconAlertCircle, IconPencil } from '@tabler/icons-react';
import { MetricSelectionModal } from './MetricSelectionModal';
import { ThresholdOverrideEditor } from './ThresholdOverrideEditor';
import { ManualMetricEntry } from './ManualMetricEntry';
import type { EpicSuccessMetricWithDetails } from '@/lib/services/successMeasurementService';
import type { MetricThresholds, SuccessMetric } from '@/lib/success/types';

interface EpicMetricsManagerProps {
  epicId: string;
  metrics: EpicSuccessMetricWithDetails[];
  isAdmin: boolean;
  configLocked: boolean;
  onRefresh: () => Promise<void>;
}

export function EpicMetricsManager({
  epicId,
  metrics,
  isAdmin,
  configLocked,
  onRefresh,
}: EpicMetricsManagerProps) {
  const [showMetricModal, setShowMetricModal] = useState(false);
  const [editingThresholdMetric, setEditingThresholdMetric] = useState<EpicSuccessMetricWithDetails | null>(null);
  const [manualEntryMetric, setManualEntryMetric] = useState<SuccessMetric | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canEdit = !configLocked || isAdmin;

  const handleAddMetric = async (metricId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/success/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric_id: metricId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to add metric');
      }

      await onRefresh();
    } catch (error: any) {
      alert(`Failed to add metric: ${error.message}`);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMetric = async (metricId: string) => {
    if (!confirm('Are you sure you want to remove this metric?')) {
      return;
    }

    try {
      const res = await fetch(`/api/epics/${epicId}/success/metrics/${metricId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to remove metric');
      }

      await onRefresh();
    } catch (error: any) {
      alert(`Failed to remove metric: ${error.message}`);
    }
  };

  const handleUpdateThreshold = async (thresholds: MetricThresholds | null) => {
    if (!editingThresholdMetric) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/success/metrics/${editingThresholdMetric.metric_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold_override: thresholds }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update threshold');
      }

      await onRefresh();
      setEditingThresholdMetric(null);
    } catch (error: any) {
      alert(`Failed to update threshold: ${error.message}`);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  const selectedMetricIds = metrics.map((m) => m.metric_id);

  return (
    <>
      <Card withBorder padding="md">
        <Stack gap="md">
          <Group justify="space-between">
            <div>
              <Text size="lg" fw={500}>
                Success Metrics
              </Text>
              <Text size="sm" c="dimmed">
                {metrics.length} of 7 metrics selected
              </Text>
            </div>
            {canEdit && metrics.length < 7 && (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setShowMetricModal(true)}
              >
                Add Metric
              </Button>
            )}
          </Group>

          {metrics.length === 0 ? (
            <Alert icon={<IconAlertCircle size={16} />} title="No Metrics" color="yellow">
              No success metrics have been selected for this epic. Add metrics to start tracking post-launch success.
            </Alert>
          ) : (
            <Stack gap="xs">
              {metrics.map((epicMetric) => {
                const metric = epicMetric.metric;
                if (!metric) return null;

                return (
                  <Card key={epicMetric.id} padding="sm" withBorder>
                    <Group justify="space-between">
                      <div style={{ flex: 1 }}>
                        <Group gap="xs" mb="xs">
                          <Text fw={500}>{metric.name}</Text>
                          {epicMetric.threshold_override && (
                            <Badge size="xs" color="orange">Custom Thresholds</Badge>
                          )}
                        </Group>
                        {metric.description && (
                          <Text size="xs" c="dimmed" mb="xs">
                            {metric.description}
                          </Text>
                        )}
                        <Group gap="xs">
                          <Badge variant="light" size="sm">{metric.category}</Badge>
                          <Badge variant="outline" size="sm">{metric.measurement_type}</Badge>
                          <Badge
                            color={metric.source === 'PENDO' ? 'blue' : metric.source === 'SNOWFLAKE' ? 'cyan' : 'gray'}
                            size="sm"
                          >
                            {metric.source}
                          </Badge>
                          <Badge
                            color={metric.leading_or_lagging === 'LEADING' ? 'green' : 'orange'}
                            size="sm"
                          >
                            {metric.leading_or_lagging}
                          </Badge>
                        </Group>
                      </div>
                      {canEdit && (
                        <Group gap="xs">
                          {metric.source === 'MANUAL' && (
                            <ActionIcon
                              variant="light"
                              color="green"
                              onClick={() => setManualEntryMetric(metric)}
                              title="Enter manual value"
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                          )}
                          <ActionIcon
                            variant="light"
                            color="blue"
                            onClick={() => setEditingThresholdMetric(epicMetric)}
                            title="Edit threshold override"
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            color="red"
                            onClick={() => handleRemoveMetric(epicMetric.metric_id)}
                            title="Remove metric"
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      )}
                    </Group>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Card>

      <MetricSelectionModal
        opened={showMetricModal}
        onClose={() => setShowMetricModal(false)}
        onSelect={handleAddMetric}
        selectedMetricIds={selectedMetricIds}
        isSubmitting={submitting}
      />

      <ThresholdOverrideEditor
        opened={!!editingThresholdMetric}
        onClose={() => setEditingThresholdMetric(null)}
        initialThresholds={editingThresholdMetric?.threshold_override || null}
        onSubmit={handleUpdateThreshold}
        isSubmitting={submitting}
      />

      {manualEntryMetric && (
        <ManualMetricEntry
          opened={!!manualEntryMetric}
          onClose={() => setManualEntryMetric(null)}
          epicId={epicId}
          metric={manualEntryMetric}
          onSubmit={async (value, snapshotDate) => {
            setSubmitting(true);
            try {
              const res = await fetch(`/api/epics/${epicId}/success/metrics/${manualEntryMetric.id}/manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  snapshot_date: snapshotDate,
                  value,
                }),
              });

              if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to save manual value');
              }

              setManualEntryMetric(null);
            } catch (error: any) {
              alert(`Failed to save manual value: ${error.message}`);
              throw error;
            } finally {
              setSubmitting(false);
            }
          }}
          isSubmitting={submitting}
        />
      )}
    </>
  );
}

