"use client";

import React, { useState } from 'react';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
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
import { IconLock, IconEdit, IconAlertCircle, IconCalendarClock, IconPlus, IconTrash, IconPencil, IconWorldShare, IconWorldOff } from '@tabler/icons-react';
import { SuccessConfigForm } from './SuccessConfigForm';
import { DelegationModal, DelegationType } from '../DelegationModal';
import { MetricSelectionModal } from './MetricSelectionModal';
import { ThresholdOverrideEditor } from './ThresholdOverrideEditor';
import { ManualMetricEntry } from './ManualMetricEntry';
import { MetricCreationForm } from './MetricCreationForm';
import { MetricEventConfig } from './MetricEventConfig';
import { MetricHistoryList } from './MetricHistoryList';
import type { EpicSuccessConfigWithDetails, EpicSuccessMetricWithDetails } from '@/lib/services/successMeasurementService';
import type { EpicTier } from '@/types/epics';
import type { CreateEpicSuccessConfigDTO, MetricThresholds, SuccessMetric } from '@/lib/success/types';
import { notifications } from '@mantine/notifications';
import { NumberInput, Modal } from '@mantine/core';

interface SuccessConfigSectionProps {
  epicId: string;
  epicName?: string;
  epicTier: EpicTier;
  config: EpicSuccessConfigWithDetails | null;
  metrics: EpicSuccessMetricWithDetails[];
  isAdmin: boolean;
  /** Can configure success metrics (CPO, PRODUCT, PRODUCT_OPS). When false, section is read-only. */
  canConfigureSuccessMetrics?: boolean;
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
  canConfigureSuccessMetrics = false,
  onRefresh,
  epicOwnerId,
  pmOwner,
}: SuccessConfigSectionProps) {
  const [showForm, setShowForm] = useState(!config);
  const [submitting, setSubmitting] = useState(false);
  const [delegationModalOpen, setDelegationModalOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [showMetricModal, setShowMetricModal] = useState(false);
  const [showCreateMetricModal, setShowCreateMetricModal] = useState(false);
  const [editingThresholdMetric, setEditingThresholdMetric] = useState<EpicSuccessMetricWithDetails | null>(null);
  const [editingTargetMetric, setEditingTargetMetric] = useState<EpicSuccessMetricWithDetails | null>(null);
  const [editingEventConfigMetric, setEditingEventConfigMetric] = useState<EpicSuccessMetricWithDetails | null>(null);
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
      const res = await fetchWithRateLimit(`/api/epics/${epicId}/success/config/lock`, {
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
          post_launch_owner: config.post_launch_owner,
          track_offline: config.track_offline,
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

  const canEdit = canConfigureSuccessMetrics && (!config.locked || isAdmin);
  const configLocked = config?.locked || false;
  const isPublished = !!(config?.success_metrics_published_at);

  const handleAddMetric = async (metricId: string) => {
    // This is now handled by MetricSelectionModal with full config
    // This function is kept for compatibility but shouldn't be called directly
    // The modal now collects target and event config before calling this
    await onRefresh();
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
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="lg" fw={500}>
              Success Configuration
            </Text>
            <Group gap="xs">
              {config?.locked && (
                <Badge leftSection={<IconLock size={12} />} color="orange">
                  Locked
                </Badge>
              )}
              {canConfigureSuccessMetrics && (
                isPublished ? (
                  <Badge leftSection={<IconWorldShare size={12} />} color="green">Published</Badge>
                ) : (
                  <Badge leftSection={<IconWorldOff size={12} />} color="gray">Draft</Badge>
                )
              )}
            </Group>
          </Group>

          <div>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>
                Success Metrics
              </Text>
              {canEdit && metrics.length < 7 && (
                <Group gap="xs">
                  <Button
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => setShowCreateMetricModal(true)}
                    variant="light"
                  >
                    Create Metric
                  </Button>
                  <Button
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => setShowMetricModal(true)}
                  >
                    Add Existing Metric
                  </Button>
                </Group>
              )}
            </Group>
            <Text size="xs" c="dimmed" mb="xs">
              {metrics.length} of 7 metrics selected
            </Text>
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
                      <Stack gap="xs">
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

                        {/* Epic-specific configuration */}
                        <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #e0e0e0' }}>
                          <Stack gap="xs">
                            <Group justify="space-between" align="flex-start">
                              <div style={{ flex: 1 }}>
                                <Text size="xs" fw={500} mb={4}>Target Value</Text>
                                {canEdit ? (
                                  <Group gap="xs" align="flex-start">
                                    <NumberInput
                                      size="xs"
                                      value={epicMetric.target ?? undefined}
                                      onChange={async (value) => {
                                        const numValue = typeof value === 'number' ? value : null;
                                        setSubmitting(true);
                                        try {
                                          const res = await fetch(`/api/epics/${epicId}/success/metrics/${epicMetric.metric_id}`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ target: numValue }),
                                          });
                                          if (!res.ok) {
                                            const errorData = await res.json();
                                            throw new Error(errorData.error || 'Failed to update target');
                                          }
                                          await onRefresh();
                                        } catch (error: any) {
                                          notifications.show({
                                            title: 'Error',
                                            message: error.message || 'Failed to update target',
                                            color: 'red',
                                          });
                                        } finally {
                                          setSubmitting(false);
                                        }
                                      }}
                                      decimalScale={metric.measurement_type === 'PERCENTAGE' ? 2 : 0}
                                      style={{ width: '120px' }}
                                      disabled={submitting}
                                    />
                                  </Group>
                                ) : (
                                  <Text size="sm">{epicMetric.target !== null && epicMetric.target !== undefined ? epicMetric.target : 'Not set'}</Text>
                                )}
                              </div>
                            </Group>

                            {/* Event/Data Source Configuration */}
                            {(epicMetric.pendo_event_id || epicMetric.snowflake_query || epicMetric.manual_label || canEdit) && (
                              <div>
                                <Text size="xs" fw={500} mb={4}>Event/Data Source Config</Text>
                                {canEdit ? (
                                  <Group gap="xs" align="flex-start">
                                    <Button
                                      size="xs"
                                      variant="subtle"
                                      onClick={() => setEditingEventConfigMetric(epicMetric)}
                                    >
                                      {epicMetric.pendo_event_id || epicMetric.snowflake_query || epicMetric.manual_label ? 'Edit Config' : 'Set Config'}
                                    </Button>
                                    {(epicMetric.pendo_event_id || epicMetric.snowflake_query || epicMetric.manual_label) && (
                                      <Text size="xs" c="dimmed">
                                        {epicMetric.pendo_event_id && `Pendo: ${epicMetric.pendo_event_id}`}
                                        {epicMetric.snowflake_query && `Snowflake: ${epicMetric.snowflake_query.substring(0, 30)}...`}
                                        {epicMetric.manual_label && `Label: ${epicMetric.manual_label}`}
                                      </Text>
                                    )}
                                  </Group>
                                ) : (
                                  <Text size="xs" c="dimmed">
                                    {epicMetric.pendo_event_id && `Pendo: ${epicMetric.pendo_event_id}`}
                                    {epicMetric.snowflake_query && `Snowflake: ${epicMetric.snowflake_query}`}
                                    {epicMetric.manual_label && `Label: ${epicMetric.manual_label}`}
                                    {!epicMetric.pendo_event_id && !epicMetric.snowflake_query && !epicMetric.manual_label && 'Using metric default'}
                                  </Text>
                                )}
                              </div>
                            )}
                          </Stack>
                        </div>
                      </Stack>
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
                <div>
                  <Group gap="xs" style={{ position: 'relative' }}>
                    <Tooltip
                      label={canDelegate && !config.locked ? 'Reschedule' : undefined}
                      position="top"
                      withArrow
                    >
                      <div
                        style={{
                          cursor: canDelegate && !config.locked ? 'pointer' : 'default',
                          position: 'relative',
                          display: 'inline-flex',
                        }}
                        onClick={() => {
                          if (canDelegate && !config.locked) {
                            setDelegationModalOpen(true);
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (canDelegate && !config.locked) {
                            const avatarEl = e.currentTarget.querySelector('[data-avatar]') as HTMLElement | null;
                            const iconEl = e.currentTarget.querySelector('[data-reschedule-icon]') as HTMLElement | null;
                            if (avatarEl) avatarEl.style.opacity = '0';
                            if (iconEl) iconEl.style.opacity = '1';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (canDelegate && !config.locked) {
                            const avatarEl = e.currentTarget.querySelector('[data-avatar]') as HTMLElement | null;
                            const iconEl = e.currentTarget.querySelector('[data-reschedule-icon]') as HTMLElement | null;
                            if (avatarEl) avatarEl.style.opacity = '1';
                            if (iconEl) iconEl.style.opacity = '0';
                          }
                        }}
                      >
                        <div style={{ position: 'relative', width: 32, height: 32 }}>
                          <Avatar
                            data-avatar
                            src={ownerDetails.avatar_url}
                            color={getAvatarColor(ownerDetails.email)}
                            radius="xl"
                            size="sm"
                            style={{ transition: 'opacity 0.2s' }}
                          >
                            {getInitials(ownerDetails.email)}
                          </Avatar>
                          {canDelegate && !config.locked && (
                            <ActionIcon
                              data-reschedule-icon
                              variant="filled"
                              color="gray"
                              radius="xl"
                              size={32}
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                opacity: 0,
                                transition: 'opacity 0.2s',
                                pointerEvents: 'none',
                              }}
                            >
                              <IconCalendarClock size={18} />
                            </ActionIcon>
                          )}
                        </div>
                      </div>
                    </Tooltip>
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
                  {canDelegate && !config.locked && (
                    <Tooltip label="Reschedule" position="top" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={() => setDelegationModalOpen(true)}
                      >
                        <IconCalendarClock size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </div>
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

      {/* History Section */}
      {config && (
        <Card withBorder padding="md" mt="md">
          <MetricHistoryList epicId={epicId} />
        </Card>
      )}

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
              const res = await fetchWithRateLimit(`/api/epics/${epicId}/delegate`, {
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

      <MetricCreationForm
        epicId={epicId}
        epicTier={epicTier}
        opened={showCreateMetricModal}
        onClose={() => setShowCreateMetricModal(false)}
        onSuccess={onRefresh}
      />

      <MetricSelectionModal
        opened={showMetricModal}
        onClose={() => setShowMetricModal(false)}
        onSelect={handleAddMetric}
        selectedMetricIds={selectedMetricIds}
        isSubmitting={submitting}
        epicTier={epicTier}
        epicId={epicId}
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

      {/* Event Config Editor Modal */}
      {editingEventConfigMetric && editingEventConfigMetric.metric && (
        <Modal
          opened={!!editingEventConfigMetric}
          onClose={() => setEditingEventConfigMetric(null)}
          title={`Configure ${editingEventConfigMetric.metric.name}`}
          size="lg"
        >
          <Stack gap="md">
            <MetricEventConfig
              metric={editingEventConfigMetric.metric}
              epicPendoEventId={editingEventConfigMetric.pendo_event_id}
              epicSnowflakeQuery={editingEventConfigMetric.snowflake_query}
              epicManualLabel={editingEventConfigMetric.manual_label}
              onPendoEventChange={async (eventId) => {
                setSubmitting(true);
                try {
                  const res = await fetch(`/api/epics/${epicId}/success/metrics/${editingEventConfigMetric.metric_id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pendo_event_id: eventId }),
                  });
                  if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || 'Failed to update event config');
                  }
                  await onRefresh();
                  setEditingEventConfigMetric(null);
                } catch (error: any) {
                  notifications.show({
                    title: 'Error',
                    message: error.message || 'Failed to update event config',
                    color: 'red',
                  });
                } finally {
                  setSubmitting(false);
                }
              }}
              onSnowflakeQueryChange={async (query) => {
                setSubmitting(true);
                try {
                  const res = await fetch(`/api/epics/${epicId}/success/metrics/${editingEventConfigMetric.metric_id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ snowflake_query: query }),
                  });
                  if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || 'Failed to update event config');
                  }
                  await onRefresh();
                  setEditingEventConfigMetric(null);
                } catch (error: any) {
                  notifications.show({
                    title: 'Error',
                    message: error.message || 'Failed to update event config',
                    color: 'red',
                  });
                } finally {
                  setSubmitting(false);
                }
              }}
              onManualLabelChange={async (label) => {
                setSubmitting(true);
                try {
                  const res = await fetch(`/api/epics/${epicId}/success/metrics/${editingEventConfigMetric.metric_id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ manual_label: label }),
                  });
                  if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || 'Failed to update event config');
                  }
                  await onRefresh();
                  setEditingEventConfigMetric(null);
                } catch (error: any) {
                  notifications.show({
                    title: 'Error',
                    message: error.message || 'Failed to update event config',
                    color: 'red',
                  });
                } finally {
                  setSubmitting(false);
                }
              }}
              onSave={async () => {
                // Save is handled individually by each onChange handler
              }}
              isSubmitting={submitting}
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setEditingEventConfigMetric(null)}>
                Close
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </>
  );
}

