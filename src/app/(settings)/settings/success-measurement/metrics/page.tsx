"use client";

import React, { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Group,
  Select,
  Drawer,
  Text,
  ActionIcon,
  Badge,
  Stack,
} from '@mantine/core';
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { MetricForm } from '@/components/admin/success-measurement/MetricForm';
import type { SuccessMetric, CreateSuccessMetricDTO, MetricCategory, MetricSource, LeadingOrLagging } from '@/lib/success/types';
import { PurpleLoader } from '@/components/PurpleLoader';

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<SuccessMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingMetric, setEditingMetric] = useState<SuccessMetric | null>(null);
  const [deletingMetric, setDeletingMetric] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    category?: MetricCategory;
    source?: MetricSource;
    leading_or_lagging?: LeadingOrLagging;
  }>({});

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.category) params.append('category', filters.category);
      if (filters.source) params.append('source', filters.source);
      if (filters.leading_or_lagging) params.append('leading_or_lagging', filters.leading_or_lagging);

      const res = await fetch(`/api/settings/success-measurement/metrics?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch metrics');
      }
      const data = await res.json();
      setMetrics(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching metrics:', err);
      setError(err.message || 'Failed to fetch metrics');
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to fetch metrics',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [filters]);

  const handleCreate = async (data: CreateSuccessMetricDTO) => {
    try {
      const res = await fetch('/api/settings/success-measurement/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create metric');
      }

      notifications.show({
        title: 'Success',
        message: 'Metric created successfully',
        color: 'green',
      });
      setShowCreateForm(false);
      fetchMetrics();
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to create metric',
        color: 'red',
      });
      throw err;
    }
  };

  const handleUpdate = async (id: string, data: Partial<CreateSuccessMetricDTO>) => {
    try {
      const res = await fetch(`/api/settings/success-measurement/metrics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update metric');
      }

      notifications.show({
        title: 'Success',
        message: 'Metric updated successfully',
        color: 'green',
      });
      setEditingMetric(null);
      fetchMetrics();
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to update metric',
        color: 'red',
      });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this metric?')) {
      return;
    }

    setDeletingMetric(id);
    try {
      const res = await fetch(`/api/settings/success-measurement/metrics/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete metric');
      }

      notifications.show({
        title: 'Success',
        message: 'Metric deleted successfully',
        color: 'green',
      });
      fetchMetrics();
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to delete metric',
        color: 'red',
      });
    } finally {
      setDeletingMetric(null);
    }
  };

  if (loading && metrics.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
        <PurpleLoader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <Group justify="space-between" mb="md">
            <div>
              <h1 style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--font-size-page-title)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-gray-900)'
              }}>
                Success Metrics
              </h1>
              <Text size="sm" c="dimmed" mt="xs">
                Manage success metrics for measurement
              </Text>
            </div>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setShowCreateForm(true)}
            >
              Create Metric
            </Button>
          </Group>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <Stack gap="md" mb="md">
            <Group>
              <Select
                label="Category"
                placeholder="All categories"
                clearable
                data={[
                  { value: 'ADOPTION', label: 'Adoption' },
                  { value: 'REVENUE', label: 'Revenue' },
                  { value: 'RETENTION', label: 'Retention' },
                  { value: 'ENABLEMENT', label: 'Enablement' },
                  { value: 'FRICTION', label: 'Friction' },
                ]}
                value={filters.category || null}
                onChange={(value) => setFilters({ ...filters, category: value as MetricCategory | undefined })}
                style={{ flex: 1 }}
              />
              <Select
                label="Source"
                placeholder="All sources"
                clearable
                data={[
                  { value: 'PENDO', label: 'Pendo' },
                  { value: 'SNOWFLAKE', label: 'Snowflake' },
                  { value: 'MANUAL', label: 'Manual' },
                ]}
                value={filters.source || null}
                onChange={(value) => setFilters({ ...filters, source: value as MetricSource | undefined })}
                style={{ flex: 1 }}
              />
              <Select
                label="Leading/Lagging"
                placeholder="All"
                clearable
                data={[
                  { value: 'LEADING', label: 'Leading' },
                  { value: 'LAGGING', label: 'Lagging' },
                ]}
                value={filters.leading_or_lagging || null}
                onChange={(value) => setFilters({ ...filters, leading_or_lagging: value as LeadingOrLagging | undefined })}
                style={{ flex: 1 }}
              />
            </Group>
          </Stack>

          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Category</Table.Th>
                <Table.Th>Measurement Type</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th>Leading/Lagging</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {metrics.map((metric) => (
                <Table.Tr key={metric.id}>
                  <Table.Td>{metric.name}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{metric.category}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="outline">{metric.measurement_type}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={metric.source === 'PENDO' ? 'blue' : metric.source === 'SNOWFLAKE' ? 'cyan' : 'gray'}>
                      {metric.source}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={metric.leading_or_lagging === 'LEADING' ? 'green' : 'orange'}>
                      {metric.leading_or_lagging}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        variant="light"
                        color="blue"
                        onClick={() => setEditingMetric(metric)}
                        title="Edit"
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="light"
                        color="red"
                        onClick={() => handleDelete(metric.id)}
                        loading={deletingMetric === metric.id}
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

          {metrics.length === 0 && !loading && (
            <Text ta="center" c="dimmed" py="xl">
              No metrics found. Create one to get started.
            </Text>
          )}
        </div>
      </div>

      <Drawer
        opened={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        title="Create Metric"
        position="right"
        size="xl"
      >
        <MetricForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreateForm(false)}
        />
      </Drawer>

      <Drawer
        opened={!!editingMetric}
        onClose={() => setEditingMetric(null)}
        title="Edit Metric"
        position="right"
        size="xl"
      >
        {editingMetric && (
          <MetricForm
            initialData={editingMetric}
            onSubmit={(data) => handleUpdate(editingMetric.id, data)}
            onCancel={() => setEditingMetric(null)}
          />
        )}
      </Drawer>
    </div>
  );
}

