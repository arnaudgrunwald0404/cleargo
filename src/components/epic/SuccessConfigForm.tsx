"use client";

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Stack,
  Select,
  Group,
  Text,
  Avatar,
  ScrollArea,
  TextInput,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { PurpleLoader } from '../PurpleLoader';
import type { AdoptionBenchmark, CreateEpicSuccessConfigDTO } from '@/lib/success/types';
import type { EpicTier } from '@/types/epics';

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

interface SuccessConfigFormProps {
  opened: boolean;
  onClose: () => void;
  epicId: string;
  epicTier: EpicTier;
  initialData?: Partial<Omit<CreateEpicSuccessConfigDTO, 'epic_id'>>;
  onSubmit: (data: Omit<CreateEpicSuccessConfigDTO, 'epic_id'>) => Promise<void>;
  isSubmitting?: boolean;
}

export function SuccessConfigForm({
  opened,
  onClose,
  epicId,
  epicTier,
  initialData,
  onSubmit,
  isSubmitting = false,
}: SuccessConfigFormProps) {
  const [benchmarks, setBenchmarks] = useState<AdoptionBenchmark[]>([]);
  const [loadingBenchmarks, setLoadingBenchmarks] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string>(initialData?.benchmark_id || '');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(initialData?.post_launch_owner || '');
  const [userSearchQuery, setUserSearchQuery] = useState('');

  useEffect(() => {
    if (opened) {
      fetchBenchmarks();
      fetchUsers();
    }
  }, [opened, epicTier]);

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

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        const usersArray = Array.isArray(data) ? data : (data.users || []);
        setUsers(Array.isArray(usersArray) ? usersArray : []);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    if (!userSearchQuery) return true;
    const query = userSearchQuery.toLowerCase();
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      fullName.includes(query)
    );
  });

  const getUserDisplayName = (user: User): string => {
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    return user.first_name || user.last_name || user.email;
  };

  const getInitials = (user: User): string => {
    if (user.first_name && user.last_name) {
      return `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();
    }
    return user.email.substring(0, 2).toUpperCase();
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
    if (!selectedBenchmarkId || !selectedOwnerId) {
      alert('Please select both a benchmark and a post-launch owner');
      return;
    }

    try {
      await onSubmit({
        benchmark_id: selectedBenchmarkId,
        post_launch_owner: selectedOwnerId,
      });
      onClose();
    } catch (error: any) {
      console.error('Error submitting config:', error);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Configure Success Measurement"
      size="lg"
    >
      <Stack gap="md">
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
          <TextInput
            placeholder="Search users..."
            leftSection={<IconSearch size={16} />}
            value={userSearchQuery}
            onChange={(e) => setUserSearchQuery(e.target.value)}
            mb="xs"
          />
          <ScrollArea h={200}>
            <Stack gap="xs">
              {loadingUsers ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                  <PurpleLoader />
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => setSelectedOwnerId(user.id)}
                    style={{
                      padding: '0.75rem',
                      border: selectedOwnerId === user.id ? '2px solid #4f46e5' : '1px solid #e0e0e0',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: selectedOwnerId === user.id ? '#eef2ff' : 'white',
                    }}
                  >
                    <Group gap="sm">
                      <Avatar
                        src={user.avatar_url}
                        color={getAvatarColor(user.email)}
                        radius="xl"
                        size="sm"
                      >
                        {getInitials(user)}
                      </Avatar>
                      <div style={{ flex: 1 }}>
                        <Text size="sm" fw={500}>
                          {getUserDisplayName(user)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {user.email}
                        </Text>
                      </div>
                    </Group>
                  </div>
                ))
              )}
            </Stack>
          </ScrollArea>
        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={isSubmitting} disabled={!selectedBenchmarkId || !selectedOwnerId}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

