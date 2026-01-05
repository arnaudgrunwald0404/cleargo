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
} from '@mantine/core';
import type { AdoptionBenchmark, CreateEpicSuccessConfigDTO } from '@/lib/success/types';
import type { EpicTier } from '@/types/epics';

interface SuccessConfigFormProps {
  epicId: string;
  epicTier: EpicTier;
  initialData?: Partial<Omit<CreateEpicSuccessConfigDTO, 'epic_id'>>;
  onSubmit: (data: Omit<CreateEpicSuccessConfigDTO, 'epic_id'>) => Promise<void>;
  isSubmitting?: boolean;
  epicOwnerId?: string | null;
  onCancel?: () => void;
  pmOwner?: { name?: string; email?: string; avatar_url?: string } | null;
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
}: SuccessConfigFormProps) {
  const [benchmarks, setBenchmarks] = useState<AdoptionBenchmark[]>([]);
  const [loadingBenchmarks, setLoadingBenchmarks] = useState(false);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string>(initialData?.benchmark_id || '');

  useEffect(() => {
    fetchBenchmarks();
  }, [epicTier]);

  const fetchBenchmarks = async () => {
    setLoadingBenchmarks(true);
    try {
      const params = new URLSearchParams();
      params.append('launch_tier', epicTier);
      params.append('is_default', 'true');

      const res = await fetch(`/api/settings/success-measurement/benchmarks?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch benchmarks');
      }
      const data = await res.json();
      const benchmarksList = Array.isArray(data) ? data : [];
      
      // Also fetch all benchmarks for this tier to show in dropdown
      const allParams = new URLSearchParams();
      allParams.append('launch_tier', epicTier);
      const allRes = await fetch(`/api/settings/success-measurement/benchmarks?${allParams.toString()}`);
      if (allRes.ok) {
        const allData = await allRes.json();
        const allBenchmarks = Array.isArray(allData) ? allData : [];
        setBenchmarks(allBenchmarks);
        
        // Set default benchmark if available
        if (!selectedBenchmarkId && benchmarksList.length > 0) {
          setSelectedBenchmarkId(benchmarksList[0].id);
        }
      }
    } catch (error: any) {
      console.error('Error fetching benchmarks:', error);
    } finally {
      setLoadingBenchmarks(false);
    }
  };


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
    if (!selectedBenchmarkId) {
      alert('Please select a benchmark');
      return;
    }

    // Post-launch owner will be auto-set by the backend to the product manager
    // We don't need to pass it - backend will auto-resolve to PM if not provided
    try {
      await onSubmit({
        benchmark_id: selectedBenchmarkId,
        // post_launch_owner is optional - backend will auto-resolve to PM if not provided
      } as Omit<CreateEpicSuccessConfigDTO, 'epic_id'>);
    } catch (error: any) {
      console.error('Error submitting config:', error);
    }
  };

  return (
    <Card withBorder padding="md">
      <Stack gap="md">
        <Text size="lg" fw={500}>
          Configure Success Measurement
        </Text>

        <Select
          label="Adoption Benchmark"
          required
          description="Select a benchmark that matches this epic's tier"
          data={benchmarks.map((b) => ({
            value: b.id,
            label: `${b.name}${b.is_default ? ' (Default)' : ''}`,
          }))}
          value={selectedBenchmarkId}
          onChange={(value) => setSelectedBenchmarkId(value || '')}
          disabled={loadingBenchmarks}
          searchable
        />

        <div>
          <Text size="sm" fw={500} mb="xs">
            Post-Launch Owner
          </Text>
          <Text size="xs" c="dimmed" mb="xs">
            Automatically set to the product manager for this epic
          </Text>
          {pmOwner ? (
            <Group gap="xs" style={{ 
              padding: '0.75rem',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              backgroundColor: '#f9fafb',
            }}>
              <Avatar
                src={pmOwner.avatar_url}
                color={getAvatarColor(pmOwner.email || '')}
                radius="xl"
                size="sm"
              >
                {getInitials(pmOwner.email || '')}
              </Avatar>
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
            <Text size="sm" c="dimmed" style={{ 
              padding: '0.75rem',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              backgroundColor: '#f9fafb',
            }}>
              Product manager will be automatically assigned
            </Text>
          )}
        </div>

        <Group justify="flex-end" mt="md">
          {onCancel && (
            <Button variant="subtle" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSubmit} loading={isSubmitting} disabled={!selectedBenchmarkId}>
            Save
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
