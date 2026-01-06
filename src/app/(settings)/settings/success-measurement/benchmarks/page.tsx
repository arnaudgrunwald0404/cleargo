"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Table,
  Button,
  Group,
  Select,
  Modal,
  Drawer,
  Text,
  ActionIcon,
  Badge,
  Stack,
} from '@mantine/core';
import { IconPlus, IconPencil, IconTrash, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { BenchmarkForm } from '@/components/admin/success-measurement/BenchmarkForm';
import type { AdoptionBenchmark, CreateAdoptionBenchmarkDTO, LaunchTier } from '@/lib/success/types';
import { PurpleLoader } from '@/components/PurpleLoader';

export default function BenchmarksPage() {
  const [benchmarks, setBenchmarks] = useState<AdoptionBenchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingBenchmark, setEditingBenchmark] = useState<AdoptionBenchmark | null>(null);
  const [deletingBenchmark, setDeletingBenchmark] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    launch_tier?: LaunchTier;
    feature_type?: string;
    is_default?: boolean;
  }>({});

  const fetchBenchmarks = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.launch_tier) params.append('launch_tier', filters.launch_tier);
      if (filters.feature_type) params.append('feature_type', filters.feature_type);
      if (filters.is_default !== undefined) params.append('is_default', String(filters.is_default));

      const res = await fetch(`/api/settings/success-measurement/benchmarks?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch benchmarks');
      }
      const data = await res.json();
      setBenchmarks(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching benchmarks:', err);
      setError(err.message || 'Failed to fetch benchmarks');
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to fetch benchmarks',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBenchmarks();
  }, [filters]);

  const handleCreate = async (data: CreateAdoptionBenchmarkDTO) => {
    try {
      const res = await fetch('/api/settings/success-measurement/benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create benchmark');
      }

      notifications.show({
        title: 'Success',
        message: 'Benchmark created successfully',
        color: 'green',
      });
      setShowCreateForm(false);
      fetchBenchmarks();
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to create benchmark',
        color: 'red',
      });
      throw err;
    }
  };

  const handleUpdate = async (id: string, data: Partial<CreateAdoptionBenchmarkDTO>) => {
    try {
      const res = await fetch(`/api/settings/success-measurement/benchmarks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update benchmark');
      }

      notifications.show({
        title: 'Success',
        message: 'Benchmark updated successfully',
        color: 'green',
      });
      setEditingBenchmark(null);
      fetchBenchmarks();
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to update benchmark',
        color: 'red',
      });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this benchmark?')) {
      return;
    }

    setDeletingBenchmark(id);
    try {
      const res = await fetch(`/api/settings/success-measurement/benchmarks/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete benchmark');
      }

      notifications.show({
        title: 'Success',
        message: 'Benchmark deleted successfully',
        color: 'green',
      });
      fetchBenchmarks();
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to delete benchmark',
        color: 'red',
      });
    } finally {
      setDeletingBenchmark(null);
    }
  };

  const handleMarkAsDefault = async (id: string) => {
    try {
      await handleUpdate(id, { is_default: true });
      // Optionally unset other defaults
      const otherDefaults = benchmarks.filter((b) => b.id !== id && b.is_default);
      for (const benchmark of otherDefaults) {
        await handleUpdate(benchmark.id, { is_default: false });
      }
      fetchBenchmarks();
    } catch (err: any) {
      // Error already shown by handleUpdate
    }
  };

  const pathname = usePathname();

  if (loading && benchmarks.length === 0) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
        <PurpleLoader size="lg" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div style={{
        maxWidth: 'var(--page-container-max-width)',
        margin: '0 auto',
        paddingLeft: 'var(--page-container-padding-x)',
        paddingRight: 'var(--page-container-padding-x)',
        paddingTop: 'var(--page-container-padding-top)',
        paddingBottom: 'var(--spacing-8)'
      }}
      className="sm:px-6 lg:px-8"
      >
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-6">
          {/* Sidebar Navigation */}
          <div className="w-64 flex-shrink-0">
            <nav>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/admin/settings"
                    className="block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm text-gray-600 hover:bg-gray-50 mb-2"
                  >
                    ← Back to Settings
                  </Link>
                </li>
                <li>
                  <div className="px-4 py-2 text-sm font-medium text-gray-900 mb-1">
                    Success Measurement
                  </div>
                  <ul className="ml-4 space-y-1">
                    <li>
                      <Link
                        href="/settings/success-measurement/metrics"
                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                          pathname === '/settings/success-measurement/metrics'
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Metrics
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/settings/success-measurement/benchmarks"
                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                          pathname === '/settings/success-measurement/benchmarks'
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Adoption Benchmarks
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/settings/success-measurement/pendo"
                        className={`block w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                          pathname === '/settings/success-measurement/pendo'
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Pendo Integration
                      </Link>
                    </li>
                  </ul>
                </li>
              </ul>
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <Group justify="space-between" mb="md">
            <div>
              <h1 style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--font-size-page-title)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-gray-900)'
              }}>
                Adoption Benchmarks
              </h1>
              <Text size="sm" c="dimmed" mt="xs">
                Manage adoption benchmarks for success measurement
              </Text>
            </div>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setShowCreateForm(true)}
            >
              Create Benchmark
            </Button>
          </Group>

              <Stack gap="md" mb="md">
            <Group>
              <Select
                label="Launch Tier"
                placeholder="All tiers"
                clearable
                data={[
                  { value: 'TIER_1', label: 'Tier 1' },
                  { value: 'TIER_2', label: 'Tier 2' },
                  { value: 'TIER_3', label: 'Tier 3' },
                ]}
                value={filters.launch_tier || null}
                onChange={(value) => setFilters({ ...filters, launch_tier: value as LaunchTier | undefined })}
                style={{ flex: 1 }}
              />
              <Select
                label="Is Default"
                placeholder="All"
                clearable
                data={[
                  { value: 'true', label: 'Default' },
                  { value: 'false', label: 'Not Default' },
                ]}
                value={filters.is_default !== undefined ? String(filters.is_default) : null}
                onChange={(value) =>
                  setFilters({
                    ...filters,
                    is_default: value === null ? undefined : value === 'true',
                  })
                }
                style={{ flex: 1 }}
              />
            </Group>
          </Stack>

          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Launch Tier</Table.Th>
                <Table.Th>Feature Type</Table.Th>
                <Table.Th>Target Persona</Table.Th>
                <Table.Th>Default</Table.Th>
                <Table.Th>Version</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {benchmarks.map((benchmark) => (
                <Table.Tr key={benchmark.id}>
                  <Table.Td>{benchmark.name}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{benchmark.launch_tier}</Badge>
                  </Table.Td>
                  <Table.Td>{benchmark.feature_type}</Table.Td>
                  <Table.Td>{benchmark.target_persona}</Table.Td>
                  <Table.Td>
                    {benchmark.is_default ? (
                      <Badge color="green">Default</Badge>
                    ) : (
                      <Text size="sm" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>{benchmark.version}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {!benchmark.is_default && (
                        <ActionIcon
                          variant="light"
                          color="green"
                          onClick={() => handleMarkAsDefault(benchmark.id)}
                          title="Mark as default"
                        >
                          <IconCheck size={16} />
                        </ActionIcon>
                      )}
                      <ActionIcon
                        variant="light"
                        color="blue"
                        onClick={() => setEditingBenchmark(benchmark)}
                        title="Edit"
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="light"
                        color="red"
                        onClick={() => handleDelete(benchmark.id)}
                        loading={deletingBenchmark === benchmark.id}
                        title="Delete"
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          {benchmarks.length === 0 && !loading && (
            <Text ta="center" c="dimmed" py="xl">
              No benchmarks found. Create one to get started.
            </Text>
              )}
            </div>
          </div>
        </div>
      </div>

      <Drawer
        opened={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        title="Create Benchmark"
        position="right"
        size="xl"
      >
        <BenchmarkForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreateForm(false)}
        />
      </Drawer>

      <Drawer
        opened={!!editingBenchmark}
        onClose={() => setEditingBenchmark(null)}
        title="Edit Benchmark"
        position="right"
        size="xl"
      >
        {editingBenchmark && (
          <BenchmarkForm
            initialData={editingBenchmark}
            onSubmit={(data) => handleUpdate(editingBenchmark.id, data)}
            onCancel={() => setEditingBenchmark(null)}
          />
        )}
      </Drawer>
    </main>
  );
}

