"use client";

import React, { useState, useEffect } from 'react';
import {
  Button,
  Stack,
  Select,
  Group,
  Text,
  Avatar,
  Card,
  Tooltip,
  ActionIcon,
  Alert,
  Badge,
} from '@mantine/core';
import { IconArrowsRightLeft, IconPlus, IconAlertCircle } from '@tabler/icons-react';
import { DelegationModal, DelegationType } from '../DelegationModal';
import { MetricSelectionModal } from './MetricSelectionModal';
import { notifications } from '@mantine/notifications';
import type { CreateEpicSuccessConfigDTO } from '@/lib/success/types';
import type { EpicTier } from '@/types/epics';
import type { EpicSuccessMetricWithDetails } from '@/lib/services/successMeasurementService';

interface SuccessConfigFormProps {
  epicId: string;
  epicTier: EpicTier;
  initialData?: Partial<Omit<CreateEpicSuccessConfigDTO, 'epic_id'>>;
  onSubmit: (data: Omit<CreateEpicSuccessConfigDTO, 'epic_id'>) => Promise<void>;
  isSubmitting?: boolean;
  epicOwnerId?: string | null;
  onCancel?: () => void;
  pmOwner?: { name?: string; email?: string; avatar_url?: string } | null;
  epicName?: string;
  isAdmin?: boolean;
  onRefresh?: () => Promise<void>;
  config?: { post_launch_owner?: string; delegated_post_launch_owner_id?: string; locked?: boolean } | null;
  metrics?: EpicSuccessMetricWithDetails[];
}

export function SuccessConfigForm({
  epicId,
  epicTier,
  initialData,
  onSubmit,
  isSubmitting = false,
  epicOwnerId,
  onCancel,
  pmOwner,
  epicName = '',
  isAdmin = false,
  onRefresh,
  config,
  metrics = [],
}: SuccessConfigFormProps) {
  const [delegationModalOpen, setDelegationModalOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [showMetricModal, setShowMetricModal] = useState(false);
  const [submittingMetric, setSubmittingMetric] = useState(false);

  // Get current user email
  useEffect(() => {
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



  const getInitials = (email: string): string => {
    return email.substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (email: string): string => {
    const colors = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'indigo'];
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const handleSubmit = async () => {
    // Post-launch owner will be auto-set by the backend to the product manager
    // We don't need to pass it - backend will auto-resolve to PM if not provided
    // Benchmark is now selected as a metric, so no need to pass benchmark_id
    try {
      await onSubmit({
        // benchmark_id is no longer required - benchmarks are selected as metrics
        // post_launch_owner is optional - backend will auto-resolve to PM if not provided
      } as Omit<CreateEpicSuccessConfigDTO, 'epic_id'>);
    } catch (error: any) {
      console.error('Error submitting config:', error);
    }
  };

  const handleAddMetric = async (metricId: string) => {
    setSubmittingMetric(true);
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

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      alert(`Failed to add metric: ${error.message}`);
      throw error;
    } finally {
      setSubmittingMetric(false);
    }
  };

  const selectedMetricIds = metrics.map((m) => m.metric_id);
  const canEditMetrics = !config?.locked || isAdmin;

  return (
    <Card withBorder padding="md">
      <Stack gap="md">
        <Text size="lg" fw={500}>
          Configure Success Measurement
        </Text>

        <div>
          <Text size="sm" fw={500} mb="xs">
            Post-Launch Owner
          </Text>
          {pmOwner ? (
            <Group gap="xs" mb="xs" style={{ position: 'relative' }}>
              <Tooltip 
                label={config && !config.locked && (isAdmin || currentUserEmail === pmOwner.email) 
                  ? "Click to delegate post-launch owner" 
                  : undefined}
                position="top"
                withArrow
              >
                <div
                  style={{
                    cursor: config && !config.locked && (isAdmin || currentUserEmail === pmOwner.email) 
                      ? 'pointer' 
                      : 'default',
                    position: 'relative',
                  }}
                  onClick={() => {
                    if (config && !config.locked && (isAdmin || currentUserEmail === pmOwner.email) && onRefresh) {
                      setDelegationModalOpen(true);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (config && !config.locked && (isAdmin || currentUserEmail === pmOwner.email)) {
                      e.currentTarget.style.opacity = '0.8';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                >
                  <Avatar
                    src={pmOwner.avatar_url}
                    color={getAvatarColor(pmOwner.email || '')}
                    radius="xl"
                    size="sm"
                  >
                    {getInitials(pmOwner.email || '')}
                  </Avatar>
                </div>
              </Tooltip>
              <div style={{ flex: 1 }}>
                <Text size="sm" fw={500}>
                  {pmOwner.name || pmOwner.email}
                </Text>
                <Text size="xs" c="dimmed">
                  {pmOwner.email}
                </Text>
              </div>
              {config && !config.locked && (isAdmin || currentUserEmail === pmOwner.email) && onRefresh && (
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
          ) : (
            <Text size="sm" c="dimmed" mb="xs">
              Product manager will be automatically assigned
            </Text>
          )}
          <Text size="xs" c="dimmed" mt="xs">
            The product manager is the default post-launch owner. This responsibility can be updated using the delegate functionality.
          </Text>
        </div>

        <div>
          <Group justify="space-between" mb="xs">
            <Text size="sm" fw={500}>
              Success Metrics
            </Text>
            {canEditMetrics && metrics.length < 7 && (
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
                  <div key={epicMetric.id} style={{ 
                    padding: '0.5rem', 
                    border: '1px solid #e0e0e0', 
                    borderRadius: '4px',
                    backgroundColor: '#f9fafb'
                  }}>
                    <Group gap="xs">
                      <Text size="sm" fw={500}>{metric.name}</Text>
                      {epicMetric.threshold_override && (
                        <Badge size="xs" color="orange">Custom Thresholds</Badge>
                      )}
                      <Badge variant="light" size="xs">{metric.category}</Badge>
                      <Badge variant="outline" size="xs">{metric.measurement_type}</Badge>
                    </Group>
                  </div>
                );
              })}
            </Stack>
          )}
        </div>

          <Group justify="flex-end" mt="md">
          {onCancel && (
            <Button variant="subtle" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSubmit} loading={isSubmitting}>
            Save
          </Button>
        </Group>
      </Stack>

      {config && pmOwner && onRefresh && (
        <DelegationModal
          opened={delegationModalOpen}
          onClose={() => setDelegationModalOpen(false)}
          epicId={epicId}
          epicName={epicName}
          taskId={epicId}
          taskLabel="Post-Launch Owner"
          category="Post-Launch"
          isGate={false}
          currentApproverEmail={pmOwner.email || ''}
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
              if (onRefresh) {
                await onRefresh();
              }
              
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
        isSubmitting={submittingMetric}
        epicTier={epicTier}
        epicId={epicId}
        onBenchmarkSelected={onRefresh}
      />
    </Card>
  );
}
