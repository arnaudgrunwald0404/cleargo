"use client";

import React, { useState } from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Button,
  Badge,
  Avatar,
  Alert,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconLock, IconEdit, IconAlertCircle, IconArrowsRightLeft, IconPlus, IconTrash, IconPencil } from '@tabler/icons-react';
import { SuccessConfigForm } from './SuccessConfigForm';
import { DelegationModal, DelegationType } from '../DelegationModal';
import { MetricSelectionModal } from './MetricSelectionModal';
import { ThresholdOverrideEditor } from './ThresholdOverrideEditor';
import { ManualMetricEntry } from './ManualMetricEntry';
import type { EpicSuccessConfigWithDetails, EpicSuccessMetricWithDetails } from '@/lib/services/successMeasurementService';
import type { EpicTier } from '@/types/epics';
import type { CreateEpicSuccessConfigDTO, MetricThresholds, SuccessMetric } from '@/lib/success/types';
import { notifications } from '@mantine/notifications';

interface SuccessConfigSectionProps {
  epicId: string;
  epicName?: string;
  epicTier: EpicTier;
  config: EpicSuccessConfigWithDetails | null;
  metrics: EpicSuccessMetricWithDetails[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  epicOwnerId?: string | null;
  pmOwner?: { name?: string; email?: string; avatar_url?: string } | null;
}

export function SuccessConfigSection({
  epicId,
  epicName = '',
  epicTier,
  config,
  metrics,
  isAdmin,
  onRefresh,
  epicOwnerId,
  pmOwner,
}: SuccessConfigSectionProps) {
  const [showForm, setShowForm] = useState(!config);
  const [submitting, setSubmitting] = useState(false);
  const [delegationModalOpen, setDelegationModalOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [showMetricModal, setShowMetricModal] = useState(false);
  const [editingThresholdMetric, setEditingThresholdMetric] = useState<EpicSuccessMetricWithDetails | null>(null);
  const [manualEntryMetric, setManualEntryMetric] = useState<SuccessMetric | null>(null);

  // Get current user email
  React.useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setCurrentUserEmail(user.email);
        }
      } catch (error) {
        console.error('Error fetching current user:', error);
      }
    };
    fetchCurrentUser();
  }, []);

  const handleSubmit = async (data: Omit<CreateEpicSuccessConfigDTO, 'epic_id'>) => {
    setSubmitting(true);
    try {
      const method = config ? 'PATCH' : 'POST';
      const res = await fetch(`/api/epics/${epicId}/success/config`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save configuration');
      }

      await onRefresh();
      setShowForm(false);
    } catch (error: any) {
      alert(`Failed to save: ${error.message}`);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
  };

  const handleLock = async () => {
    if (!confirm('Are you sure you want to lock this configuration? It cannot be modified afterwards (except by admins).')) {
      return;
    }

    try {
      const res = await fetch(`/api/epics/${epicId}/success/config/lock`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to lock configuration');
      }

      await onRefresh();
    } catch (error: any) {
      alert(`Failed to lock: ${error.message}`);
    }
  };

  const getInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (email: string) => {
    const colors = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'indigo'];
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  if (!config || showForm) {
    return (
      <SuccessConfigForm
        epicId={epicId}
        epicTier={epicTier}
        initialData={config ? {
          benchmark_id: config.benchmark_id,
          post_launch_owner: config.post_launch_owner,
        } : undefined}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
        epicOwnerId={epicOwnerId}
        onCancel={config ? handleCancel : undefined}
        pmOwner={pmOwner}
        epicName={epicName}
        isAdmin={isAdmin}
        onRefresh={onRefresh}
        config={config}
        metrics={metrics}
      />
    );
  }

  const canEdit = !config.locked || isAdmin;
  const configLocked = config?.locked || false;

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
            <Text size="lg" fw={500}>
              Success Configuration
            </Text>
            {config?.locked && (
              <Badge leftSection={<IconLock size={12} />} color="orange">
                Locked
              </Badge>
            )}
          </Group>

          <div>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>
                Success Metrics
              </Text>
              {canEdit && metrics.length < 7 && (
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => setShowMetricModal(true)}
                >
                  Add Metric
                </Button>
              )}
            </Group>
            <Text size="xs" c="dimmed" mb="xs">
              {metrics.length} of 7 metrics selected
            </Text>
            {metrics.length === 0 ? (
              <Alert icon={<IconAlertCircle size={16} />} title="No Metrics" color="yellow" size="sm">
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
                            <Text size="sm" fw={500}>{metric.name}</Text>
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
                            <Badge variant="light" size="xs">{metric.category}</Badge>
                            <Badge variant="outline" size="xs">{metric.measurement_type}</Badge>
                            <Badge
                              color={metric.source === 'PENDO' ? 'blue' : metric.source === 'SNOWFLAKE' ? 'cyan' : 'gray'}
                              size="xs"
                            >
                              {metric.source}
                            </Badge>
                            <Badge
                              color={metric.leading_or_lagging === 'LEADING' ? 'green' : 'orange'}
                              size="xs"
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
                                size="sm"
                                onClick={() => setManualEntryMetric(metric)}
                                title="Enter manual value"
                              >
                                <IconPencil size={14} />
                              </ActionIcon>
                            )}
                            <ActionIcon
                              variant="light"
                              color="blue"
                              size="sm"
                              onClick={() => setEditingThresholdMetric(epicMetric)}
                              title="Edit threshold override"
                            >
                              <IconEdit size={14} />
                            </ActionIcon>
                            <ActionIcon
                              variant="light"
                              color="red"
                              size="sm"
                              onClick={() => handleRemoveMetric(epicMetric.metric_id)}
                              title="Remove metric"
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Group>
                        )}
                      </Group>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </div>

          <div>
            <Text size="sm" fw={500} mb="xs">
              Post-Launch Owner
            </Text>
            {(() => {
              // Show delegated owner if present, otherwise show original owner
              const ownerDetails = config.delegated_post_launch_owner_details || config.post_launch_owner_details;
              const isDelegated = !!config.delegated_post_launch_owner_details;
              const canDelegate = isAdmin || 
                currentUserEmail === config.post_launch_owner_details?.email ||
                currentUserEmail === config.delegated_post_launch_owner_details?.email;

              if (!ownerDetails) {
                return <Text size="sm" c="dimmed">Not assigned</Text>;
              }

              return (
                <Group gap="xs" style={{ position: 'relative' }}>
                  <Tooltip 
                    label={canDelegate && !config.locked 
                      ? "Click to delegate post-launch owner" 
                      : undefined}
                    position="top"
                    withArrow
                  >
                    <div
                      style={{
                        cursor: canDelegate && !config.locked ? 'pointer' : 'default',
                        position: 'relative',
                      }}
                      onClick={() => {
                        if (canDelegate && !config.locked) {
                          setDelegationModalOpen(true);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (canDelegate && !config.locked) {
                          e.currentTarget.style.opacity = '0.8';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                    >
                      <Avatar
                        src={ownerDetails.avatar_url}
                        color={getAvatarColor(ownerDetails.email)}
                        radius="xl"
                        size="sm"
                      >
                        {getInitials(ownerDetails.email)}
                      </Avatar>
                    </div>
                  </Tooltip>
                  <div style={{ flex: 1 }}>
                    <Group gap="xs">
                      <Text size="sm">
                        {ownerDetails.first_name && ownerDetails.last_name
                          ? `${ownerDetails.first_name} ${ownerDetails.last_name}`
                          : ownerDetails.email}
                      </Text>
                      {isDelegated && (
                        <Badge size="xs" color="blue" variant="light">
                          Delegated
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {ownerDetails.email}
                    </Text>
                    {isDelegated && config.post_launch_owner_details && (
                      <Text size="xs" c="dimmed" mt={4}>
                        Originally: {config.post_launch_owner_details.email}
                      </Text>
                    )}
                  </div>
                  {canDelegate && !config.locked && (
                    <Tooltip label="Delegate post-launch owner" position="top" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={() => setDelegationModalOpen(true)}
                      >
                        <IconArrowsRightLeft size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              );
            })()}
          </div>

          {config?.locked_at && (
            <div>
              <Text size="xs" c="dimmed">
                Locked at: {new Date(config.locked_at).toLocaleString()}
              </Text>
            </div>
          )}

          <Group justify="flex-end" mt="md">
            {!config.locked && (
              <Button
                variant="outline"
                color="orange"
                leftSection={<IconLock size={16} />}
                onClick={handleLock}
              >
                Lock Configuration
              </Button>
            )}
            {canEdit && (
              <Button
                leftSection={<IconEdit size={16} />}
                onClick={() => setShowForm(true)}
              >
                Edit
              </Button>
            )}
          </Group>
        </Stack>
      </Card>

      {config && (
        <DelegationModal
          opened={delegationModalOpen}
          onClose={() => setDelegationModalOpen(false)}
          epicId={epicId}
          epicName={epicName}
          taskId={epicId} // Use epicId as taskId for POST_LAUNCH_OWNER
          taskLabel="Post-Launch Owner"
          category="Post-Launch"
          isGate={false}
          currentApproverEmail={config.delegated_post_launch_owner_details?.email || config.post_launch_owner_details?.email || ''}
          onDelegate={async (delegationType: DelegationType, newApproverEmail: string) => {
            try {
              const res = await fetch(`/api/epics/${epicId}/delegate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  delegationType: 'POST_LAUNCH_OWNER',
                  newApproverEmail,
                }),
              });

              if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to delegate');
              }

              setDelegationModalOpen(false);
              await onRefresh();
              
              notifications.show({
                title: 'Delegation successful',
                message: `Post-launch owner has been delegated to ${newApproverEmail}`,
                color: 'green',
              });
            } catch (error: any) {
              console.error('Delegation error:', error);
              notifications.show({
                title: 'Delegation failed',
                message: error.message || 'Failed to delegate post-launch owner',
                color: 'red',
              });
              throw error;
            }
          }}
        />
      )}

      <MetricSelectionModal
        opened={showMetricModal}
        onClose={() => setShowMetricModal(false)}
        onSelect={handleAddMetric}
        selectedMetricIds={selectedMetricIds}
        isSubmitting={submitting}
        epicTier={epicTier}
        epicId={epicId}
        onBenchmarkSelected={onRefresh}
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
              await onRefresh();
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

