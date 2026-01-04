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
} from '@mantine/core';
import { IconLock, IconEdit, IconAlertCircle } from '@tabler/icons-react';
import { SuccessConfigForm } from './SuccessConfigForm';
import type { EpicSuccessConfigWithDetails } from '@/lib/services/successMeasurementService';
import type { EpicTier } from '@/types/epics';

interface SuccessConfigSectionProps {
  epicId: string;
  epicTier: EpicTier;
  config: EpicSuccessConfigWithDetails | null;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}

export function SuccessConfigSection({
  epicId,
  epicTier,
  config,
  isAdmin,
  onRefresh,
}: SuccessConfigSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: { benchmark_id: string; post_launch_owner: string }) => {
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

  if (!config) {
    return (
      <>
        <Alert icon={<IconAlertCircle size={16} />} title="Not Configured" color="yellow">
          Success measurement is not configured for this epic. Configure it to start tracking post-launch success.
        </Alert>
        <Group justify="flex-end" mt="md">
          <Button onClick={() => setShowForm(true)}>
            Configure Success Measurement
          </Button>
        </Group>
        <SuccessConfigForm
          opened={showForm}
          onClose={() => setShowForm(false)}
          epicId={epicId}
          epicTier={epicTier}
          onSubmit={handleSubmit}
          isSubmitting={submitting}
        />
      </>
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
            {config.post_launch_owner_details ? (
              <Group gap="xs">
                <Avatar
                  src={config.post_launch_owner_details.avatar_url}
                  color={getAvatarColor(config.post_launch_owner_details.email)}
                  radius="xl"
                  size="sm"
                >
                  {getInitials(config.post_launch_owner_details.email)}
                </Avatar>
                <div>
                  <Text size="sm">
                    {config.post_launch_owner_details.first_name && config.post_launch_owner_details.last_name
                      ? `${config.post_launch_owner_details.first_name} ${config.post_launch_owner_details.last_name}`
                      : config.post_launch_owner_details.email}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {config.post_launch_owner_details.email}
                  </Text>
                </div>
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                Not assigned
              </Text>
            )}
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

      <SuccessConfigForm
        opened={showForm}
        onClose={() => setShowForm(false)}
        epicId={epicId}
        epicTier={epicTier}
        initialData={{
          benchmark_id: config.benchmark_id,
          post_launch_owner: config.post_launch_owner,
        }}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
      />
    </>
  );
}

