"use client";

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Stack,
  TextInput,
  Select,
  Group,
  Text,
  Badge,
  ScrollArea,
  Card,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { PurpleLoader } from '../PurpleLoader';
import type { SuccessMetric, MetricCategory, MetricSource, LeadingOrLagging, AdoptionBenchmark } from '@/lib/success/types';
import type { EpicTier } from '@/types/epics';

interface MetricSelectionModalProps {
  opened: boolean;
  onClose: () => void;
  onSelect: (metricId: string) => Promise<void>;
  selectedMetricIds: string[];
  isSubmitting?: boolean;
  epicTier?: EpicTier;
  epicId?: string;
  onBenchmarkSelected?: () => Promise<void>;
}

export function MetricSelectionModal({
  opened,
  onClose,
  onSelect,
  selectedMetricIds,
  isSubmitting = false,
  epicTier,
  epicId,
  onBenchmarkSelected,
}: MetricSelectionModalProps) {
  const [metrics, setMetrics] = useState<SuccessMetric[]>([]);
  const [benchmarks, setBenchmarks] = useState<AdoptionBenchmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<MetricCategory | null>(null);
  const [sourceFilter, setSourceFilter] = useState<MetricSource | null>(null);
  const [leadingOrLaggingFilter, setLeadingOrLaggingFilter] = useState<LeadingOrLagging | null>(null);

  const fetchMetrics = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      if (sourceFilter) params.append('source', sourceFilter);
      if (leadingOrLaggingFilter) params.append('leading_or_lagging', leadingOrLaggingFilter);

      const res = await fetch(`/api/settings/success-measurement/metrics?${params.toString()}`);
      if (!res.ok) {
        let errorMessage = 'Failed to fetch metrics';
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorData.details || errorMessage;
        } catch (parseError) {
          // If response is not JSON, use status text
          errorMessage = res.statusText || errorMessage;
        }
        console.error('Error fetching metrics:', {
          status: res.status,
          statusText: res.statusText,
          error: errorMessage,
        });
        setError(`${errorMessage} (${res.status})`);
        setMetrics([]);
        return;
      }
      const data = await res.json();
      setMetrics(Array.isArray(data) ? data : []);

      // Also fetch benchmarks if epicTier is provided
      if (epicTier) {
        try {
          const benchmarkParams = new URLSearchParams();
          benchmarkParams.append('launch_tier', epicTier);
          const benchmarkRes = await fetch(`/api/settings/success-measurement/benchmarks?${benchmarkParams.toString()}`);
          if (benchmarkRes.ok) {
            const benchmarkData = await benchmarkRes.json();
            setBenchmarks(Array.isArray(benchmarkData) ? benchmarkData : []);
          }
        } catch (benchmarkError) {
          console.warn('Failed to fetch benchmarks:', benchmarkError);
          setBenchmarks([]);
        }
      }
    } catch (error: any) {
      // Better error message handling
      let errorMessage = 'Failed to fetch metrics. Please try again.';
      
      if (error) {
        if (typeof error === 'string') {
          errorMessage = error;
        } else if (error?.message) {
          errorMessage = error.message;
        } else if (error?.toString && error.toString() !== '[object Object]') {
          errorMessage = error.toString();
        } else {
          // Log the full error for debugging
          console.error('Error fetching metrics (full error):', {
            error,
            type: typeof error,
            keys: Object.keys(error || {}),
            stringified: JSON.stringify(error, Object.getOwnPropertyNames(error)),
          });
        }
      }
      
      console.error('Error fetching metrics:', errorMessage, error);
      setError(errorMessage);
      setMetrics([]);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, sourceFilter, leadingOrLaggingFilter, epicTier]);

  useEffect(() => {
    if (opened) {
      fetchMetrics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const filteredMetrics = metrics.filter((metric) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!metric.name.toLowerCase().includes(query) &&
          !metric.description?.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

  const filteredBenchmarks = benchmarks.filter((benchmark) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!benchmark.name.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

  const handleSelectBenchmark = async (benchmarkId: string) => {
    if (!epicId) {
      alert('Epic ID is required to select a benchmark');
      return;
    }
    try {
      // When a benchmark is selected, set it in the config
      const res = await fetch(`/api/epics/${epicId}/success/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benchmark_id: benchmarkId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to set benchmark');
      }

      // Refresh parent component if callback provided
      if (onBenchmarkSelected) {
        await onBenchmarkSelected();
      }
      
      onClose();
      setSearchQuery('');
    } catch (error: any) {
      console.error('Error selecting benchmark:', error);
      alert(`Failed to select benchmark: ${error.message}`);
    }
  };

  const handleSelect = async (metricId: string) => {
    try {
      await onSelect(metricId);
      onClose();
      setSearchQuery('');
    } catch (error: any) {
      console.error('Error selecting metric:', error);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Select Metric"
      size="xl"
    >
      <Stack gap="md">
        <Group>
          <TextInput
            placeholder="Search metrics..."
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <Select
            placeholder="Category"
            clearable
            data={[
              { value: 'ADOPTION', label: 'Adoption' },
              { value: 'REVENUE', label: 'Revenue' },
              { value: 'RETENTION', label: 'Retention' },
              { value: 'ENABLEMENT', label: 'Enablement' },
              { value: 'FRICTION', label: 'Friction' },
            ]}
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value as MetricCategory | null)}
            style={{ flex: 1 }}
          />
          <Select
            placeholder="Source"
            clearable
            data={[
              { value: 'PENDO', label: 'Pendo' },
              { value: 'SNOWFLAKE', label: 'Snowflake' },
              { value: 'MANUAL', label: 'Manual' },
            ]}
            value={sourceFilter}
            onChange={(value) => setSourceFilter(value as MetricSource | null)}
            style={{ flex: 1 }}
          />
          <Select
            placeholder="Leading/Lagging"
            clearable
            data={[
              { value: 'LEADING', label: 'Leading' },
              { value: 'LAGGING', label: 'Lagging' },
            ]}
            value={leadingOrLaggingFilter}
            onChange={(value) => setLeadingOrLaggingFilter(value as LeadingOrLagging | null)}
            style={{ flex: 1 }}
          />
        </Group>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <PurpleLoader />
          </div>
        ) : error ? (
          <Card padding="md" withBorder>
            <Stack gap="xs">
              <Text c="red" fw={500}>Error loading metrics</Text>
              <Text size="sm" c="dimmed">{error}</Text>
              <Button
                size="xs"
                variant="light"
                onClick={() => fetchMetrics()}
              >
                Retry
              </Button>
            </Stack>
          </Card>
        ) : (
          <ScrollArea h={400}>
            <Stack gap="xs">
              {/* Show benchmarks first if available */}
              {filteredBenchmarks.length > 0 && (
                <>
                  <Text size="sm" fw={500} mt="xs">Adoption Benchmarks</Text>
                  {filteredBenchmarks.map((benchmark) => {
                    // Check if this benchmark is already set in config
                    // For now, we'll treat benchmarks separately - they set benchmark_id in config
                    return (
                      <Card
                        key={`benchmark-${benchmark.id}`}
                        padding="md"
                        withBorder
                        style={{
                          cursor: 'pointer',
                          borderColor: '#6366f1',
                        }}
                        onClick={() => handleSelectBenchmark(benchmark.id)}
                      >
                        <Group justify="space-between">
                          <div style={{ flex: 1 }}>
                            <Group gap="xs" mb="xs">
                              <Text fw={500}>{benchmark.name}</Text>
                              <Badge color="purple">Benchmark</Badge>
                              {benchmark.is_default && <Badge color="blue" variant="light">Default</Badge>}
                            </Group>
                            <Group gap="xs">
                              <Badge variant="light">{benchmark.feature_type}</Badge>
                              <Badge variant="outline">{benchmark.target_persona}</Badge>
                              <Badge color="indigo">{benchmark.launch_tier}</Badge>
                            </Group>
                          </div>
                          <Button
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectBenchmark(benchmark.id);
                            }}
                            disabled={isSubmitting}
                          >
                            Select
                          </Button>
                        </Group>
                      </Card>
                    );
                  })}
                  <Text size="sm" fw={500} mt="md">Success Metrics</Text>
                </>
              )}
              
              {filteredMetrics.map((metric) => {
                const isSelected = selectedMetricIds.includes(metric.id);
                return (
                  <Card
                    key={metric.id}
                    padding="md"
                    withBorder
                    style={{
                      opacity: isSelected ? 0.5 : 1,
                      cursor: isSelected ? 'not-allowed' : 'pointer',
                    }}
                    onClick={() => !isSelected && handleSelect(metric.id)}
                  >
                    <Group justify="space-between">
                      <div style={{ flex: 1 }}>
                        <Group gap="xs" mb="xs">
                          <Text fw={500}>{metric.name}</Text>
                          {isSelected && <Badge color="blue">Selected</Badge>}
                        </Group>
                        {metric.description && (
                          <Text size="sm" c="dimmed" mb="xs">
                            {metric.description}
                          </Text>
                        )}
                        <Group gap="xs">
                          <Badge variant="light">{metric.category}</Badge>
                          <Badge variant="outline">{metric.measurement_type}</Badge>
                          <Badge color={metric.source === 'PENDO' ? 'blue' : metric.source === 'SNOWFLAKE' ? 'cyan' : 'gray'}>
                            {metric.source}
                          </Badge>
                          <Badge color={metric.leading_or_lagging === 'LEADING' ? 'green' : 'orange'}>
                            {metric.leading_or_lagging}
                          </Badge>
                        </Group>
                      </div>
                      {!isSelected && (
                        <Button
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelect(metric.id);
                          }}
                          disabled={isSubmitting}
                        >
                          Add
                        </Button>
                      )}
                    </Group>
                  </Card>
                );
              })}
            </Stack>
            {filteredMetrics.length === 0 && filteredBenchmarks.length === 0 && (
              <Text ta="center" c="dimmed" py="xl">
                No metrics or benchmarks found
              </Text>
            )}
          </ScrollArea>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

