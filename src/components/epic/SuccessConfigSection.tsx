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
import { IconLock, IconEdit, IconAlertCircle, IconArrowsRightLeft } from '@tabler/icons-react';
import { SuccessConfigForm } from './SuccessConfigForm';
import { DelegationModal, DelegationType } from '../DelegationModal';
import type { EpicSuccessConfigWithDetails } from '@/lib/services/successMeasurementService';
import type { EpicTier } from '@/types/epics';
import type { CreateEpicSuccessConfigDTO } from '@/lib/success/types';
import { notifications } from '@mantine/notifications';

interface SuccessConfigSectionProps {
  epicId: string;
  epicName?: string;
  epicTier: EpicTier;
  config: EpicSuccessConfigWithDetails | null;
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
  isAdmin,
  onRefresh,
  epicOwnerId,
  pmOwner,
}: SuccessConfigSectionProps) {
  const [showForm, setShowForm] = useState(!config);
  const [submitting, setSubmitting] = useState(false);
  const [delegationModalOpen, setDelegationModalOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');

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
      />
    );
  }

  const canEdit = !config.locked || isAdmin;

  return (
    <>
      <Card withBorder padding="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="lg" fw={500}>
              Success Configuration
            </Text>
            {config.locked && (
              <Badge leftSection={<IconLock size={12} />} color="orange">
                Locked
              </Badge>
            )}
          </Group>

          <div>
            <Text size="sm" fw={500} mb="xs">
              Adoption Benchmark
            </Text>
            <Text>{config.benchmark?.name || 'Unknown'}</Text>
            {config.benchmark && (
              <Text size="xs" c="dimmed" mt="xs">
                {config.benchmark.feature_type} • {config.benchmark.target_persona}
              </Text>
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
                  <Avatar
                    src={ownerDetails.avatar_url}
                    color={getAvatarColor(ownerDetails.email)}
                    radius="xl"
                    size="sm"
                  >
                    {getInitials(ownerDetails.email)}
                  </Avatar>
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

          {config.locked_at && (
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
    </>
  );
}

