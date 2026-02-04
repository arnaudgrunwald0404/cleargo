"use client";

import React, { useEffect, useState } from 'react';
import {
  Stack,
  Group,
  Select,
  TextInput,
  Button,
  Tabs,
  Alert,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { SuccessMetricsSummary } from '@/components/dashboard/SuccessMetricsSummary';
import { EpicSuccessList } from '@/components/dashboard/EpicSuccessList';
import { PurpleLoader } from '@/components/PurpleLoader';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import type {
  SuccessMetricsSummary as SummaryType,
  EpicSuccessSummary,
} from '@/lib/services/successDashboardService';

export default function SuccessMetricsDashboardPage() {
  const [summary, setSummary] = useState<SummaryType | null>(null);
  const [epics, setEpics] = useState<EpicSuccessSummary[]>([]);
  const [attentionEpics, setAttentionEpics] = useState<EpicSuccessSummary[]>([]);
  const [topEpics, setTopEpics] = useState<EpicSuccessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('overview');

  const [filters, setFilters] = useState({
    tier: '',
    status: '',
    dateRangeStart: '',
    dateRangeEnd: '',
  });

  useEffect(() => {
    fetchDashboardData();
  }, [filters]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.tier) params.append('tier', filters.tier);
      if (filters.status) params.append('status', filters.status);
      if (filters.dateRangeStart) params.append('date_range_start', filters.dateRangeStart);
      if (filters.dateRangeEnd) params.append('date_range_end', filters.dateRangeEnd);

      const [summaryRes, epicsRes, attentionRes, topRes] = await Promise.all([
        fetchWithRateLimit(`/api/dashboard/success-metrics?view=summary&${params.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/dashboard/success-metrics?view=list&${params.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/dashboard/success-metrics?view=attention&${params.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/dashboard/success-metrics?view=top&limit=10&${params.toString()}`, { maxRetries: 1 }),
      ]);

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData);
      }

      if (epicsRes.ok) {
        const epicsData = await epicsRes.json();
        setEpics(Array.isArray(epicsData) ? epicsData : []);
      }

      if (attentionRes.ok) {
        const attentionData = await attentionRes.json();
        setAttentionEpics(Array.isArray(attentionData) ? attentionData : []);
      }

      if (topRes.ok) {
        const topData = await topRes.json();
        setTopEpics(Array.isArray(topData) ? topData : []);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !summary) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <PurpleLoader />
      </div>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
            Success Metrics Dashboard
          </h1>
          <p style={{ margin: '0.5rem 0 0 0', color: '#868e96', fontSize: '0.875rem' }}>
            Track post-launch success metrics across all epics
          </p>
        </div>
        <Button
          variant="light"
          leftSection={<IconRefresh size={16} />}
          onClick={fetchDashboardData}
        >
          Refresh
        </Button>
      </Group>

      <Group gap="md">
        <Select
          label="Tier"
          placeholder="All tiers"
          data={[
            { value: '', label: 'All Tiers' },
            { value: 'TIER_1', label: 'Tier 1' },
            { value: 'TIER_2', label: 'Tier 2' },
            { value: 'TIER_3', label: 'Tier 3' },
          ]}
          value={filters.tier}
          onChange={(value) => setFilters({ ...filters, tier: value || '' })}
          clearable
        />
        <Select
          label="Status"
          placeholder="All statuses"
          data={[
            { value: '', label: 'All Statuses' },
            { value: 'Released_Cohort_1', label: 'Released Cohort 1' },
            { value: 'Released_GA', label: 'Released GA' },
            { value: 'Released_Retroed', label: 'Released Retroed' },
          ]}
          value={filters.status}
          onChange={(value) => setFilters({ ...filters, status: value || '' })}
          clearable
        />
        <TextInput
          label="Start Date"
          type="date"
          value={filters.dateRangeStart}
          onChange={(e) => setFilters({ ...filters, dateRangeStart: e.target.value })}
        />
        <TextInput
          label="End Date"
          type="date"
          value={filters.dateRangeEnd}
          onChange={(e) => setFilters({ ...filters, dateRangeEnd: e.target.value })}
        />
      </Group>

      {summary && (
        <SuccessMetricsSummary summary={summary} loading={loading} />
      )}

      <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'overview')}>
        <Tabs.List>
          <Tabs.Tab value="overview">All Epics</Tabs.Tab>
          <Tabs.Tab value="attention">
            Needs Attention ({attentionEpics.length})
          </Tabs.Tab>
          <Tabs.Tab value="top">Top Performers</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <EpicSuccessList epics={epics} loading={loading} />
        </Tabs.Panel>

        <Tabs.Panel value="attention" pt="md">
          {attentionEpics.length === 0 ? (
            <Alert icon={<IconAlertCircle size={16} />} color="green" title="All Good!">
              No epics need attention. All scorecards are on track.
            </Alert>
          ) : (
            <EpicSuccessList epics={attentionEpics} loading={loading} />
          )}
        </Tabs.Panel>

        <Tabs.Panel value="top" pt="md">
          <EpicSuccessList epics={topEpics} loading={loading} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

