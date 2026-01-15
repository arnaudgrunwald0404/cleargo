"use client";

import React, { useState, useEffect } from 'react';
import {
  Button,
  Stack,
  Select,
  MultiSelect,
  Group,
  Text,
  Avatar,
  Card,
  Tooltip,
  ActionIcon,
  Alert,
  Badge,
  NumberInput,
  Divider,
} from '@mantine/core';
import { IconCalendarClock, IconPlus, IconAlertCircle, IconX } from '@tabler/icons-react';
import { DelegationModal, DelegationType } from '../DelegationModal';
import { notifications } from '@mantine/notifications';
import { MetricCreationForm } from './MetricCreationForm';
import type { CreateEpicSuccessConfigDTO, SuccessMetric } from '@/lib/success/types';
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
  config?: { post_launch_owner?: string; delegated_post_launch_owner_id?: string | null; locked?: boolean } | null;
  metrics?: EpicSuccessMetricWithDetails[];
}

interface MetricSelection {
  metricId: string | null;
  target: number | null;
  pendoEventId: string | null;
  snowflakeQuery: string | null;
  manualLabel: string | null;
   pendoSegmentIds: string[] | null;
   pendoSegmentNames: string[] | null;
   pendoAppIds: string[] | null;
   pendoAppNames: string[] | null;
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
  const [availableMetrics, setAvailableMetrics] = useState<SuccessMetric[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [pendoEvents, setPendoEvents] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingPendoEvents, setLoadingPendoEvents] = useState(false);
  const [pendoSegments, setPendoSegments] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingPendoSegments, setLoadingPendoSegments] = useState(false);
  const [pendoApps, setPendoApps] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingPendoApps, setLoadingPendoApps] = useState(false);
  const [metricSelections, setMetricSelections] = useState<MetricSelection[]>([
    { metricId: null, target: null, pendoEventId: null, snowflakeQuery: null, manualLabel: null, pendoSegmentIds: null, pendoSegmentNames: null, pendoAppIds: null, pendoAppNames: null },
    { metricId: null, target: null, pendoEventId: null, snowflakeQuery: null, manualLabel: null, pendoSegmentIds: null, pendoSegmentNames: null, pendoAppIds: null, pendoAppNames: null },
    { metricId: null, target: null, pendoEventId: null, snowflakeQuery: null, manualLabel: null, pendoSegmentIds: null, pendoSegmentNames: null, pendoAppIds: null, pendoAppNames: null },
  ]);
  const [savingMetrics, setSavingMetrics] = useState(false);
  const [visibleMetricSlots, setVisibleMetricSlots] = useState(1);
  const [showCreateMetricModal, setShowCreateMetricModal] = useState(false);

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

  // Fetch available metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      setLoadingMetrics(true);
      try {
        const res = await fetch('/api/settings/success-measurement/metrics');
        if (res.ok) {
          const data = await res.json();
          setAvailableMetrics(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoadingMetrics(false);
      }
    };
    fetchMetrics();
  }, []);

  // Fetch Pendo events
  useEffect(() => {
    const fetchPendoEvents = async () => {
      setLoadingPendoEvents(true);
      try {
        const res = await fetch('/api/settings/success-measurement/pendo/events');
        if (res.ok) {
          const data = await res.json();
          if (data.events && Array.isArray(data.events)) {
            const eventOptions = data.events
              .filter((event: { name: string; id?: string; description?: string }) => event && event.name)
              .map((event: { name: string; id?: string; description?: string }) => ({
                value: event.name,
                label: event.name + (event.description ? ` - ${event.description}` : ''),
              }));
            setPendoEvents(eventOptions);
          }
        }
      } catch (error) {
        console.error('Error fetching Pendo events:', error);
      } finally {
        setLoadingPendoEvents(false);
      }
    };
    fetchPendoEvents();
  }, []);

  // Fetch Pendo segments
  useEffect(() => {
    const fetchPendoSegments = async () => {
      setLoadingPendoSegments(true);
      try {
        const res = await fetch('/api/settings/success-measurement/pendo/segments');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.segments)) {
            const options = data.segments
              .filter((segment: { id?: string; name?: string }) => segment && (segment.id || segment.name))
              .map((segment: { id?: string; name?: string }) => ({
                value: segment.id || segment.name!,
                label: segment.name || segment.id!,
              }));
            setPendoSegments(options);
          }
        }
      } catch (error) {
        console.error('Error fetching Pendo segments:', error);
      } finally {
        setLoadingPendoSegments(false);
      }
    };
    fetchPendoSegments();
  }, []);

  // Fetch Pendo apps
  useEffect(() => {
    const fetchPendoApps = async () => {
      setLoadingPendoApps(true);
      try {
        const res = await fetch('/api/settings/success-measurement/pendo/apps');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.apps)) {
            const options = data.apps
              .filter((app: { id?: string; name?: string }) => app && (app.id || app.name))
              .map((app: { id?: string; name?: string }) => ({
                value: app.id || app.name!,
                label: app.name || app.id!,
              }));
            setPendoApps(options);
          }
        }
      } catch (error) {
        console.error('Error fetching Pendo apps:', error);
      } finally {
        setLoadingPendoApps(false);
      }
    };
    fetchPendoApps();
  }, []);

  // Initialize metric selections from existing metrics
  useEffect(() => {
    const initialSelections: MetricSelection[] = [
      { metricId: null, target: null, pendoEventId: null, snowflakeQuery: null, manualLabel: null, pendoSegmentIds: null, pendoSegmentNames: null, pendoAppIds: null, pendoAppNames: null },
      { metricId: null, target: null, pendoEventId: null, snowflakeQuery: null, manualLabel: null, pendoSegmentIds: null, pendoSegmentNames: null, pendoAppIds: null, pendoAppNames: null },
      { metricId: null, target: null, pendoEventId: null, snowflakeQuery: null, manualLabel: null, pendoSegmentIds: null, pendoSegmentNames: null, pendoAppIds: null, pendoAppNames: null },
    ];

    if (metrics.length > 0) {
      metrics.slice(0, 3).forEach((epicMetric, index) => {
        if (index < 3) {
          initialSelections[index] = {
            metricId: epicMetric.metric_id,
            target: epicMetric.target,
            pendoEventId: epicMetric.pendo_event_id,
            snowflakeQuery: epicMetric.snowflake_query,
            manualLabel: epicMetric.manual_label,
            pendoSegmentIds: (epicMetric as any).pendo_segment_ids || null,
            pendoSegmentNames: (epicMetric as any).pendo_segment_names || null,
            pendoAppIds: (epicMetric as any).pendo_app_ids || null,
            pendoAppNames: (epicMetric as any).pendo_app_names || null,
          };
        }
      });
    }

    setMetricSelections(initialSelections);

    // Show at least 1 slot, up to the number of existing metrics (max 3)
    const slotsFromMetrics = Math.min(3, Math.max(1, metrics.length || 1));
    setVisibleMetricSlots(slotsFromMetrics);
  }, [metrics]);



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

  const handleMetricChange = (index: number, metricId: string | null) => {
    const newSelections = [...metricSelections];
    const selectedMetric = availableMetrics.find(m => m.id === metricId);

    newSelections[index] = {
      metricId,
      target: newSelections[index].target,
      pendoEventId: selectedMetric?.source === 'PENDO' && selectedMetric.pendo_event_id ? selectedMetric.pendo_event_id : null,
      snowflakeQuery: null,
      manualLabel: null,
      pendoSegmentIds: null,
      pendoSegmentNames: null,
      pendoAppIds: null,
      pendoAppNames: null,
    };

    setMetricSelections(newSelections);
  };

  const handleTargetChange = async (index: number, value: number | null) => {
    const newSelections = [...metricSelections];
    newSelections[index].target = value;
    setMetricSelections(newSelections);

    const metricId = newSelections[index].metricId;
    if (!metricId) return;

    setSavingMetrics(true);
    try {
      const existingMetric = metrics.find(m => m.metric_id === metricId);
      const metric = availableMetrics.find(m => m.id === metricId);

      if (!metric) {
        throw new Error('Selected metric not found');
      }

      if (!existingMetric) {
        // Frontend validation to avoid backend 400s
        if (value === null || value === undefined) {
          throw new Error('Target is required for this metric');
        }

        if (metric.source === 'PENDO' && !metric.pendo_event_id && !newSelections[index].pendoEventId) {
          throw new Error('Pendo event ID is required. Please select an event for this epic before setting a target.');
        }

        if (metric.source === 'SNOWFLAKE' && !newSelections[index].snowflakeQuery) {
          throw new Error('Snowflake query is required for Snowflake metrics. Configure the query before setting a target.');
        }

        // Create new mapping (target is required by schema)
        const payload: any = {
          metric_id: metricId,
          target: value,
        };

        if (metric.source === 'PENDO' && newSelections[index].pendoEventId) {
          payload.pendo_event_id = newSelections[index].pendoEventId;
          if (newSelections[index].pendoSegmentIds) {
            payload.pendo_segment_ids = newSelections[index].pendoSegmentIds;
            payload.pendo_segment_names = newSelections[index].pendoSegmentNames;
          }
          if (newSelections[index].pendoAppIds) {
            payload.pendo_app_ids = newSelections[index].pendoAppIds;
            payload.pendo_app_names = newSelections[index].pendoAppNames;
          }
        } else if (metric.source === 'SNOWFLAKE' && newSelections[index].snowflakeQuery) {
          payload.snowflake_query = newSelections[index].snowflakeQuery;
        } else if (metric.source === 'MANUAL' && newSelections[index].manualLabel) {
          payload.manual_label = newSelections[index].manualLabel;
        }

        const res = await fetch(`/api/epics/${epicId}/success/metrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          let errorMessage = 'Failed to add metric';
          let details: any = null;
          try {
            details = await res.json();
            // Prefer specific details from server when available
            if (typeof details?.details === 'string' && details.details.trim()) {
              errorMessage = details.details.trim();
            } else if (typeof details?.error === 'string' && details.error.trim()) {
              errorMessage = details.error.trim();
            } else if (details?.details && typeof details.details === 'object') {
              // Likely a Zod flatten object; present a concise message
              errorMessage = 'Validation failed: please check required fields.';
            }
          } catch {
            // ignore parse errors, keep default message
          }

          // If server says the metric already exists (stale local metrics), fall back to PATCH target
          if (res.status === 400 && /already added/i.test(errorMessage)) {
            const patchRes = await fetch(`/api/epics/${epicId}/success/metrics/${metricId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ target: value }),
            });
            if (!patchRes.ok) {
              const patchErr = await patchRes.json().catch(() => null);
              throw new Error(patchErr?.error || 'Failed to update target');
            }
            // PATCH succeeded; proceed as if create succeeded
          } else {
            throw new Error(errorMessage);
          }
        }
      } else {
        // Update existing mapping
        const res = await fetch(`/api/epics/${epicId}/success/metrics/${metricId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: value }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          throw new Error(errorData?.error || 'Failed to update target');
        }
      }

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      console.error('Error updating target:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update target',
        color: 'red',
      });
    } finally {
      setSavingMetrics(false);
    }
  };

  const handlePendoEventChange = async (index: number, eventId: string | null) => {
    const newSelections = [...metricSelections];
    newSelections[index].pendoEventId = eventId;
    setMetricSelections(newSelections);

    const metricId = newSelections[index].metricId;
    if (!metricId) return;

    const existingMetric = metrics.find(m => m.metric_id === metricId);
    if (!existingMetric) {
      // If mapping doesn't exist yet, we will create it when target is set
      return;
    }

    setSavingMetrics(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/success/metrics/${metricId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendo_event_id: eventId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to update Pendo event');
      }

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      console.error('Error updating Pendo event:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update Pendo event',
        color: 'red',
      });
    } finally {
      setSavingMetrics(false);
    }
  };

  const handlePendoSegmentsChange = async (index: number, segmentIds: string[]) => {
    const newSelections = [...metricSelections];
    const ids = segmentIds.length > 0 ? segmentIds : null;
    const idSet = new Set(segmentIds);
    const names = ids
      ? pendoSegments
          .filter((s) => idSet.has(s.value))
          .map((s) => s.label)
      : null;
    newSelections[index].pendoSegmentIds = ids;
    newSelections[index].pendoSegmentNames = names;
    setMetricSelections(newSelections);

    const metricId = newSelections[index].metricId;
    if (!metricId) return;

    const existingMetric = metrics.find((m) => m.metric_id === metricId);
    if (!existingMetric) {
      // Mapping will be created when target is set
      return;
    }

    setSavingMetrics(true);
    try {
      const payload: any = {
        pendo_segment_ids: ids,
        pendo_segment_names: names,
      };
      const res = await fetch(`/api/epics/${epicId}/success/metrics/${metricId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to update Pendo segments');
      }

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      console.error('Error updating Pendo segments:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update Pendo segments',
        color: 'red',
      });
    } finally {
      setSavingMetrics(false);
    }
  };

  const handlePendoAppsChange = async (index: number, appIds: string[]) => {
    const newSelections = [...metricSelections];
    const ids = appIds.length > 0 ? appIds : null;
    const idSet = new Set(appIds);
    const names = ids
      ? pendoApps
          .filter((a) => idSet.has(a.value))
          .map((a) => a.label)
      : null;
    newSelections[index].pendoAppIds = ids;
    newSelections[index].pendoAppNames = names;
    setMetricSelections(newSelections);

    const metricId = newSelections[index].metricId;
    if (!metricId) return;

    const existingMetric = metrics.find((m) => m.metric_id === metricId);
    if (!existingMetric) {
      // Mapping will be created when target is set
      return;
    }

    setSavingMetrics(true);
    try {
      const payload: any = {
        pendo_app_ids: ids,
        pendo_app_names: names,
      };
      const res = await fetch(`/api/epics/${epicId}/success/metrics/${metricId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to update Pendo apps');
      }

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      console.error('Error updating Pendo apps:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update Pendo apps',
        color: 'red',
      });
    } finally {
      setSavingMetrics(false);
    }
  };

  const handleRemoveMetric = async (index: number) => {
    const previousMetricId = metricSelections[index]?.metricId || null;
    const newSelections = [...metricSelections];
    newSelections[index] = { 
      metricId: null, 
      target: null, 
      pendoEventId: null, 
      snowflakeQuery: null, 
      manualLabel: null,
      pendoSegmentIds: null,
      pendoSegmentNames: null,
      pendoAppIds: null,
      pendoAppNames: null,
    };
    setMetricSelections(newSelections);

    if (!previousMetricId) return;

    setSavingMetrics(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/success/metrics/${previousMetricId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to remove metric');
      }

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      console.error('Error removing metric:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to remove metric',
        color: 'red',
      });
    } finally {
      setSavingMetrics(false);
    }
  };

  const selectedMetricIds = metricSelections.map(s => s.metricId).filter(Boolean) as string[];
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
                  ? "Reschedule" 
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
                    display: 'inline-flex'
                  }}
                  onClick={() => {
                    if (config && !config.locked && (isAdmin || currentUserEmail === pmOwner.email) && onRefresh) {
                      setDelegationModalOpen(true);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (config && !config.locked && (isAdmin || currentUserEmail === pmOwner.email)) {
                      const avatarEl = e.currentTarget.querySelector('[data-avatar]') as HTMLElement | null;
                      const iconEl = e.currentTarget.querySelector('[data-reschedule-icon]') as HTMLElement | null;
                      if (avatarEl) avatarEl.style.opacity = '0';
                      if (iconEl) iconEl.style.opacity = '1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (config && !config.locked && (isAdmin || currentUserEmail === pmOwner.email)) {
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
                      src={pmOwner.avatar_url}
                      color={getAvatarColor(pmOwner.email || '')}
                      radius="xl"
                      size="sm"
                      style={{ transition: 'opacity 0.2s' }}
                    >
                      {getInitials(pmOwner.email || '')}
                    </Avatar>
                    {config && !config.locked && (isAdmin || currentUserEmail === pmOwner.email) && (
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
                          pointerEvents: 'none'
                        }}
                      >
                        <IconCalendarClock size={18} />
                      </ActionIcon>
                    )}
                  </div>
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
          <Text size="sm" fw={500} mb="xs">
            Success Metrics
          </Text>
          <Text size="xs" c="dimmed" mb="xs">
            {selectedMetricIds.length} metrics selected / 3 maximum. We recommend at least one leading and one lagging metric when possible.
          </Text>
          {canEditMetrics && selectedMetricIds.length === 0 && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="blue"
              variant="light"
              mb="sm"
            >
              No metrics selected yet. Choose at least one metric to start tracking post-launch success.
            </Alert>
          )}
          {canEditMetrics ? (
            <Stack gap="md">
              {metricSelections.slice(0, visibleMetricSlots).map((selection, index) => {
                const selectedMetric = selection.metricId 
                  ? availableMetrics.find(m => m.id === selection.metricId)
                  : null;
                
                const availableOptions = availableMetrics
                  .filter(m => !selectedMetricIds.includes(m.id) || m.id === selection.metricId)
                  .map(m => ({ value: m.id, label: m.name }));
                const defineNewOption = { value: '__DEFINE_NEW__', label: 'Define New Metric' };

                return (
                  <Card key={index}  padding="md" bg="blue.0">
                    <Stack gap="sm">
                      
                      
               

                      {/* Layout: row 1 shows Select + pills inline; row 2 aligns Pendo Event (if any) with Target */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        {/* Row 1: Select Metric + pills inline (span 2 columns) */}
                        <div style={{ gridColumn: '1 / 3' }}>
                          <Text size="sm" fw={500} mb={4}>
                            Metric {index + 1}
                          </Text>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              alignItems: 'end',
                              columnGap: 12,
                            }}
                          >
                            <Select
                              placeholder="Choose a metric..."
                              data={[...availableOptions, defineNewOption]}
                              value={selection.metricId}
                              onChange={(value) => {
                                if (value === '__DEFINE_NEW__') {
                                  setShowCreateMetricModal(true);
                                  return;
                                }
                                handleMetricChange(index, value);
                              }}
                              searchable
                              disabled={loadingMetrics}
                            />

                            {selectedMetric && (
                              <Group gap="xs" justify="flex-center" align="center">
                                <Badge
                                  variant="filled"
                                  color="blue"
                                  size="lg"
                                  style={{ fontSize: '12px', borderWidth: '1px' }}
                                >
                                  {selectedMetric.category}
                                </Badge>
                                <Badge
                                  variant="filled"
                                  color="grape"
                                  size="lg"
                                  style={{ fontSize: '12px', borderWidth: '1px' }}
                                >
                                  {selectedMetric.measurement_type}
                                </Badge>
                                <Badge
                                  variant="filled"
                                  color={
                                    selectedMetric.source === 'PENDO'
                                      ? 'blue'
                                      : selectedMetric.source === 'SNOWFLAKE'
                                        ? 'cyan'
                                        : 'gray'
                                  }
                                  size="lg"
                                  style={{ fontSize: '12px', borderWidth: '1px' }}
                                >
                                  {selectedMetric.source}
                                </Badge>
                              </Group>
                            )}
                          </div>
                        </div>

                        {/* Row 2: Left = Pendo Event (when applicable). Right = Target */}
                        <div>
                          {selectedMetric?.source === 'PENDO' && (
                            <div>
                              {(() => {
                                const current = selection.pendoEventId;
                                const eventOptions = current && !pendoEvents.some((o) => o.value === current)
                                  ? [{ value: current, label: current }, ...pendoEvents]
                                  : pendoEvents;
                                return (
                                  <Select
                                    label="Pendo Event"
                                    placeholder={loadingPendoEvents ? 'Loading events...' : 'Select event name'}
                                    data={eventOptions}
                                    value={current}
                                    onChange={(value) => handlePendoEventChange(index, value || null)}
                                    searchable
                                    disabled={loadingPendoEvents}
                                    allowDeselect
                                  />
                                );
                              })()}
                              <Text size="xs" c="dimmed">
                                {selectedMetric.pendo_event_id
                                  ? `Epic can override the default event "${selectedMetric.pendo_event_id}" for this metric.`
                                  : 'Select the Pendo event that should be tracked for this epic.'}
                              </Text>

                              <MultiSelect
                                label="Pendo Segments (optional)"
                                placeholder={
                                  loadingPendoSegments
                                    ? 'Loading segments...'
                                    : 'Filter by one or more Pendo segments'
                                }
                                data={pendoSegments}
                                value={selection.pendoSegmentIds || []}
                                onChange={(values) => handlePendoSegmentsChange(index, values)}
                                searchable
                                disabled={loadingPendoSegments}
                                clearable
                                mt="sm"
                              />
                              <MultiSelect
                                label="Pendo Apps (optional)"
                                placeholder={
                                  loadingPendoApps ? 'Loading apps...' : 'Filter by one or more Pendo apps'
                                }
                                data={pendoApps}
                                value={selection.pendoAppIds || []}
                                onChange={(values) => handlePendoAppsChange(index, values)}
                                searchable
                                disabled={loadingPendoApps}
                                clearable
                                mt="sm"
                              />
                            </div>
                          )}
                        </div>
                        <div>
                          {selectedMetric && (
                            <NumberInput
                              label="Target Value"
                              placeholder="Enter target"
                              value={selection.target ?? undefined}
                              onChange={(value) => handleTargetChange(index, typeof value === 'number' ? value : null)}
                              decimalScale={selectedMetric.measurement_type === 'PERCENTAGE' ? 2 : 0}
                              min={0}
                            />
                          )}
                        </div>
                      </div>


                    </Stack>
                  </Card>
                );
              })}
              {visibleMetricSlots < 3 && (
                <Group justify="flex-start">
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => setVisibleMetricSlots((prev) => Math.min(3, prev + 1))}
                  >
                    Add metric
                  </Button>
                </Group>
              )}
            </Stack>
          ) : (
            <Stack gap="xs">
              {metrics.length === 0 ? (
                <Alert icon={<IconAlertCircle size={16} />} title="No Metrics" color="yellow">
                  No success metrics have been selected for this epic.
                </Alert>
              ) : (
                metrics.map((epicMetric) => {
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
                        {epicMetric.target !== null && (
                          <Badge size="xs" color="blue">Target: {epicMetric.target}</Badge>
                        )}
                        {epicMetric.pendo_event_id && (
                          <Badge size="xs" color="green">Event: {epicMetric.pendo_event_id}</Badge>
                        )}
                        <Badge variant="light" size="xs">{metric.category}</Badge>
                        <Badge variant="outline" size="xs">{metric.measurement_type}</Badge>
                      </Group>
                    </div>
                  );
                })
              )}
            </Stack>
          )}
        </div>

        <Group justify="flex-end" mt="md">
          {onCancel && (
            <Button variant="subtle" onClick={onCancel} disabled={isSubmitting || savingMetrics}>
              Close
            </Button>
          )}
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

      <MetricCreationForm
        epicId={epicId}
        epicTier={epicTier}
        opened={showCreateMetricModal}
        onClose={() => setShowCreateMetricModal(false)}
        onSuccess={async () => {
          if (onRefresh) {
            await onRefresh();
          }
        }}
      />

    </Card>
  );
}
