"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Stack,
  Group,
  Select,
  TextInput,
  Button,
  Card,
  Text,
  Title,
  Progress,
  Table,
  Badge,
  SegmentedControl,
  Tabs,
  SimpleGrid,
  Box,
} from '@mantine/core';
import { IconRefresh, IconAlertCircle } from '@tabler/icons-react';
import { PurpleLoader } from '@/components/PurpleLoader';
import { AnalyticsTrendChart } from '@/components/analytics/AnalyticsTrendChart';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import { canRolesPerform } from '@/lib/permissions';
import type {
  SuccessPlanCompletionRate,
  RetroCompletionRate,
  LaunchHygieneDistribution,
  CriteriaOnTimeStats,
  PMTimelinessStats,
  TimeSeriesData,
} from '@/lib/services/analyticsService';
import type {
  AdoptionMetrics,
  StickinessMetrics,
  UsageByRole,
  UserActivityTrends,
} from '@/lib/services/usageAnalyticsService';

type TabValue = 'launch-metrics' | 'timeliness' | 'usage' | 'notifications';

export default function AnalyticsDashboardPage() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>('launch-metrics');
  const [loadedTabs, setLoadedTabs] = useState<Set<TabValue>>(new Set());

  // Launch Metrics data
  const [successPlanData, setSuccessPlanData] = useState<SuccessPlanCompletionRate | null>(null);
  const [retroData, setRetroData] = useState<RetroCompletionRate | null>(null);
  const [hygieneData, setHygieneData] = useState<LaunchHygieneDistribution | null>(null);
  const [successPlanTrendData, setSuccessPlanTrendData] = useState<TimeSeriesData | null>(null);
  const [retroTrendData, setRetroTrendData] = useState<TimeSeriesData | null>(null);
  const [hygieneTrendData, setHygieneTrendData] = useState<TimeSeriesData | null>(null);
  const [launchMetricsLoading, setLaunchMetricsLoading] = useState(false);

  // Timeliness data
  const [criteriaTimelinessData, setCriteriaTimelinessData] = useState<CriteriaOnTimeStats | null>(null);
  const [pmTimelinessData, setPMTimelinessData] = useState<PMTimelinessStats[] | null>(null);
  const [timelinessLoading, setTimelinessLoading] = useState(false);

  // Usage Analytics data
  const [adoptionMetrics, setAdoptionMetrics] = useState<AdoptionMetrics | null>(null);
  const [stickinessMetrics, setStickinessMetrics] = useState<StickinessMetrics | null>(null);
  const [usageByRole, setUsageByRole] = useState<UsageByRole[] | null>(null);
  const [usageTrends, setUsageTrends] = useState<UserActivityTrends | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  // Notifications data
  const [notifications, setNotifications] = useState<any[] | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const [viewMode, setViewMode] = useState<{
    successPlan: 'snapshot' | 'trends';
    retro: 'snapshot' | 'trends';
    hygiene: 'snapshot' | 'trends';
  }>({ successPlan: 'snapshot', retro: 'snapshot', hygiene: 'snapshot' });

  const [filters, setFilters] = useState({
    tier: '',
    pod: '',
    dateRangeStart: '',
    dateRangeEnd: '',
    role: '',
  });
  const [pods, setPods] = useState<string[]>([]);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const res = await fetchWithRateLimit('/api/me', { credentials: 'include', maxRetries: 1 });
        if (res.ok) {
          const data = await res.json();
          const roles = Array.isArray(data.user?.roles)
            ? data.user.roles
            : (data.user?.role ? [data.user.role] : []);
          setHasAccess(canRolesPerform(roles, 'analytics.read'));
        } else {
          setHasAccess(false);
        }
      } catch {
        setHasAccess(false);
      } finally {
        setCheckingAccess(false);
      }
    };
    checkAccess();
  }, []);

  useEffect(() => {
    const fetchPods = async () => {
      try {
        const res = await fetchWithRateLimit('/api/admin/pods', { maxRetries: 1 });
        if (res.ok) {
          const data = await res.json();
          setPods(data.pods || []);
        }
      } catch (error) {
        console.error('Failed to fetch pods:', error);
      }
    };
    if (hasAccess) {
      fetchPods();
    }
  }, [hasAccess]);

  // Lazy load tab data when tab is selected
  useEffect(() => {
    if (!hasAccess) return;
    if (!loadedTabs.has(activeTab)) {
      switch (activeTab) {
        case 'launch-metrics':
          fetchLaunchMetrics();
          break;
        case 'timeliness':
          fetchTimeliness();
          break;
        case 'usage':
          fetchUsageAnalytics();
          break;
        case 'notifications':
          fetchNotifications();
          break;
      }
      setLoadedTabs(prev => new Set(prev).add(activeTab));
    }
  }, [activeTab, hasAccess]);

  // Refetch when filters or view modes change (only for loaded tabs)
  useEffect(() => {
    if (!hasAccess) return;
    if (loadedTabs.has('launch-metrics')) {
      fetchLaunchMetrics();
    }
    if (loadedTabs.has('timeliness')) {
      fetchTimeliness();
    }
    if (loadedTabs.has('usage')) {
      fetchUsageAnalytics();
    }
    if (loadedTabs.has('notifications')) {
      fetchNotifications();
    }
  }, [filters, viewMode.successPlan, viewMode.retro, viewMode.hygiene]);

  const fetchLaunchMetrics = async () => {
    setLaunchMetricsLoading(true);
    try {
      const baseParams = new URLSearchParams();
      if (filters.tier) baseParams.append('tier', filters.tier);
      if (filters.pod) baseParams.append('pod', filters.pod);
      if (filters.dateRangeStart) baseParams.append('date_range_start', filters.dateRangeStart);
      if (filters.dateRangeEnd) baseParams.append('date_range_end', filters.dateRangeEnd);

      const successPlanParams = new URLSearchParams(baseParams);
      if (viewMode.successPlan === 'trends') {
        successPlanParams.set('trends', 'true');
        successPlanParams.set('months_back', '6');
      }
      const retroParams = new URLSearchParams(baseParams);
      if (viewMode.retro === 'trends') {
        retroParams.set('trends', 'true');
        retroParams.set('months_back', '6');
      }
      const hygieneParams = new URLSearchParams(baseParams);
      if (viewMode.hygiene === 'trends') {
        hygieneParams.set('trends', 'true');
        hygieneParams.set('months_back', '6');
      }

      const [successPlanRes, retroRes, hygieneRes] = await Promise.all([
        fetchWithRateLimit(`/api/analytics/success-plan-completion?${successPlanParams.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/analytics/retro-completion?${retroParams.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/analytics/launch-hygiene?${hygieneParams.toString()}`, { maxRetries: 1 }),
      ]);

      if (successPlanRes.ok) {
        const data = await successPlanRes.json();
        if (viewMode.successPlan === 'trends' && data.dataPoints != null) {
          setSuccessPlanTrendData(data);
          setSuccessPlanData(null);
        } else {
          setSuccessPlanData(data);
          setSuccessPlanTrendData(null);
        }
      }

      if (retroRes.ok) {
        const data = await retroRes.json();
        if (viewMode.retro === 'trends' && data.dataPoints != null) {
          setRetroTrendData(data);
          setRetroData(null);
        } else {
          setRetroData(data);
          setRetroTrendData(null);
        }
      }

      if (hygieneRes.ok) {
        const data = await hygieneRes.json();
        if (viewMode.hygiene === 'trends' && data.dataPoints != null) {
          setHygieneTrendData(data);
          setHygieneData(null);
        } else {
          setHygieneData(data);
          setHygieneTrendData(null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch launch metrics:', error);
    } finally {
      setLaunchMetricsLoading(false);
    }
  };

  const fetchTimeliness = async () => {
    setTimelinessLoading(true);
    try {
      const baseParams = new URLSearchParams();
      if (filters.tier) baseParams.append('tier', filters.tier);
      if (filters.pod) baseParams.append('pod', filters.pod);
      if (filters.dateRangeStart) baseParams.append('date_range_start', filters.dateRangeStart);
      if (filters.dateRangeEnd) baseParams.append('date_range_end', filters.dateRangeEnd);

      const [criteriaRes, pmRes] = await Promise.all([
        fetchWithRateLimit(`/api/analytics/criteria-timeliness?${baseParams.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/analytics/pm-timeliness?${baseParams.toString()}`, { maxRetries: 1 }),
      ]);

      if (criteriaRes.ok) {
        const data = await criteriaRes.json();
        setCriteriaTimelinessData(data);
      }

      if (pmRes.ok) {
        const data = await pmRes.json();
        setPMTimelinessData(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch timeliness data:', error);
    } finally {
      setTimelinessLoading(false);
    }
  };

  const fetchUsageAnalytics = async () => {
    setUsageLoading(true);
    try {
      const baseParams = new URLSearchParams();
      if (filters.dateRangeStart) baseParams.append('date_range_start', filters.dateRangeStart);
      if (filters.dateRangeEnd) baseParams.append('date_range_end', filters.dateRangeEnd);
      if (filters.role) baseParams.append('role', filters.role);
      baseParams.append('days_back', '30');

      const [adoptionRes, stickinessRes, byRoleRes, trendsRes] = await Promise.all([
        fetchWithRateLimit(`/api/analytics/usage?metric=adoption&${baseParams.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/analytics/usage?metric=stickiness&${baseParams.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/analytics/usage?metric=by-role&${baseParams.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/analytics/usage?metric=trends&${baseParams.toString()}`, { maxRetries: 1 }),
      ]);

      if (adoptionRes.ok) {
        const data = await adoptionRes.json();
        setAdoptionMetrics(data);
      }

      if (stickinessRes.ok) {
        const data = await stickinessRes.json();
        setStickinessMetrics(data);
      }

      if (byRoleRes.ok) {
        const data = await byRoleRes.json();
        setUsageByRole(Array.isArray(data) ? data : []);
      }

      if (trendsRes.ok) {
        const data = await trendsRes.json();
        setUsageTrends(data);
      }
    } catch (error) {
      console.error('Failed to fetch usage analytics:', error);
    } finally {
      setUsageLoading(false);
    }
  };

  const fetchNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const res = await fetchWithRateLimit('/api/analytics/notifications?limit=50', { maxRetries: 1 });
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data) ? data : []);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Failed to fetch notifications:', res.status, errorData);
        setNotifications([]);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleRefresh = () => {
    switch (activeTab) {
      case 'launch-metrics':
        fetchLaunchMetrics();
        break;
      case 'timeliness':
        fetchTimeliness();
        break;
      case 'usage':
        fetchUsageAnalytics();
        break;
      case 'notifications':
        fetchNotifications();
        break;
    }
  };

  if (checkingAccess) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <PurpleLoader />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div style={{ paddingTop: '6rem', padding: '2rem', display: 'flex', justifyContent: 'center', minHeight: '100vh' }}>
        <Card withBorder padding="xl" style={{ maxWidth: 600 }}>
          <Stack gap="md" align="center">
            <IconAlertCircle size={48} color="var(--mantine-color-red-6)" />
            <Title order={2}>Access Denied</Title>
            <Text c="dimmed" ta="center">
              You do not have permission to view the Analytics dashboard.
            </Text>
            <Button component={Link} href="/" variant="light">
              Go to Home
            </Button>
          </Stack>
        </Card>
      </div>
    );
  }

  const isLoading = (activeTab === 'launch-metrics' && launchMetricsLoading) ||
    (activeTab === 'timeliness' && timelinessLoading) ||
    (activeTab === 'usage' && usageLoading) ||
    (activeTab === 'notifications' && notificationsLoading);

  return (
    <div
      className="min-h-screen pb-8"
      style={{
        fontFamily: 'var(--font-body)',
        backgroundColor: 'var(--color-platinum)',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--page-container-max-width)',
          margin: '0 auto',
          paddingLeft: 'var(--page-container-padding-x)',
          paddingRight: 'var(--page-container-padding-x)',
          paddingTop: 'var(--page-container-padding-top)',
        }}
        className="sm:px-6 lg:px-8"
      >
        <div className="mb-8">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title
                order={1}
                className="text-4xl font-bold mb-2"
                style={{
                  fontFamily: 'var(--font-marcellus), serif',
                  color: 'var(--color-gray-900)',
                  fontSize: 'var(--font-size-4xl)',
                  fontWeight: 'var(--font-weight-bold)',
                  margin: 0,
                }}
              >
                Analytics Dashboard
              </Title>
              <Text
                size="lg"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--color-gray-500)',
                  fontSize: 'var(--font-size-lg)',
                  marginTop: '0.5rem',
                }}
              >
                Adoption, Compliance, Timeliness, Outcomes
              </Text>
            </div>
            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={handleRefresh}
              variant="light"
              loading={isLoading}
            >
              Refresh
            </Button>
          </Group>
        </div>

        <Stack gap="md">
          {/* Filters */}
          <Group mb="lg" align="center" gap="sm">
            <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>Filters:</Text>
            <Box
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '16px',
                padding: '8px 0'
              }}
            >
              <Select
                placeholder="All Tiers"
                data={[
                  { value: '', label: 'All Tiers' },
                  { value: 'TIER_1', label: 'Tier 1' },
                  { value: 'TIER_2', label: 'Tier 2' },
                  { value: 'TIER_3', label: 'Tier 3' },
                ]}
                value={filters.tier}
                onChange={(value) => setFilters({ ...filters, tier: value || '' })}
                clearable
                style={{ minWidth: 120 }}
                styles={{
                  input: {
                    borderRadius: 8,
                    border: '1px solid var(--color-gray-300)',
                    backgroundColor: 'var(--color-gray-50)',
                    fontFamily: 'var(--font-body)'
                  }
                }}
              />
              <Select
                placeholder="All Pods"
                data={[
                  { value: '', label: 'All Pods' },
                  ...pods.map(pod => ({ value: pod, label: pod }))
                ]}
                value={filters.pod}
                onChange={(value) => setFilters({ ...filters, pod: value || '' })}
                clearable
                style={{ minWidth: 150 }}
                styles={{
                  input: {
                    borderRadius: 8,
                    border: '1px solid var(--color-gray-300)',
                    backgroundColor: 'var(--color-gray-50)',
                    fontFamily: 'var(--font-body)'
                  }
                }}
              />
              <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'flex-end' }}>
                <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--font-body)', lineHeight: 1, height: '16px' }}>From</Text>
                <TextInput
                  type="date"
                  value={filters.dateRangeStart}
                  onChange={(e) => setFilters({ ...filters, dateRangeStart: e.target.value })}
                  style={{ minWidth: 160 }}
                  styles={{
                    input: {
                      borderRadius: 8,
                      border: '1px solid var(--color-gray-300)',
                      fontFamily: 'var(--font-body)'
                    }
                  }}
                />
              </Box>
              <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'flex-end' }}>
                <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--font-body)', lineHeight: 1, height: '16px' }}>To</Text>
                <TextInput
                  type="date"
                  value={filters.dateRangeEnd}
                  onChange={(e) => setFilters({ ...filters, dateRangeEnd: e.target.value })}
                  style={{ minWidth: 160 }}
                  styles={{
                    input: {
                      borderRadius: 8,
                      border: '1px solid var(--color-gray-300)',
                      fontFamily: 'var(--font-body)'
                    }
                  }}
                />
              </Box>
              {activeTab === 'usage' && (
                <Select
                  placeholder="All Roles"
                  data={[
                    { value: '', label: 'All Roles' },
                    { value: 'PM', label: 'PM' },
                    { value: 'PMM', label: 'PMM' },
                    { value: 'ADMIN', label: 'Admin' },
                    { value: 'SUPERADMIN', label: 'Super Admin' },
                  ]}
                  value={filters.role}
                  onChange={(value) => setFilters({ ...filters, role: value || '' })}
                  clearable
                  style={{ minWidth: 120 }}
                  styles={{
                    input: {
                      borderRadius: 8,
                      border: '1px solid var(--color-gray-300)',
                      backgroundColor: 'var(--color-gray-50)',
                      fontFamily: 'var(--font-body)'
                    }
                  }}
                />
              )}
            </Box>
          </Group>

          <Tabs value={activeTab} onChange={(value) => setActiveTab((value || 'launch-metrics') as TabValue)}>
            <Tabs.List>
          <Tabs.Tab value="launch-metrics">Launch Metrics</Tabs.Tab>
          <Tabs.Tab value="timeliness">Timeliness</Tabs.Tab>
          <Tabs.Tab value="usage">Usage Analytics</Tabs.Tab>
          <Tabs.Tab value="notifications">Notifications</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="launch-metrics" pt="md">
          {launchMetricsLoading && !successPlanData && !retroData && !hygieneData ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <PurpleLoader />
            </div>
          ) : (
            <Stack gap="md">
              {/* Metric 4: Success Plan Completion */}
              <Card withBorder>
                <Stack gap="md">
                  <Group justify="space-between" wrap="wrap">
                    <div>
                      <Title order={3} size="h4">
                        Metric 4: % Launches with Success Plan Completed On Time
                      </Title>
                      <Text c="dimmed" size="sm">
                        Percentage of epics where success plan is completed (locked) with at least 1 metric before GA date
                      </Text>
                    </div>
                    <SegmentedControl
                      value={viewMode.successPlan}
                      onChange={(v) => setViewMode((prev) => ({ ...prev, successPlan: v as 'snapshot' | 'trends' }))}
                      data={[
                        { label: 'Snapshot', value: 'snapshot' },
                        { label: 'Trends', value: 'trends' },
                      ]}
                    />
                  </Group>

                  {viewMode.successPlan === 'trends' ? (
                    successPlanTrendData ? (
                      <Stack gap="xs">
                        <Text size="xs" c="dimmed">Last 6 months (by GA date)</Text>
                        <AnalyticsTrendChart
                          dataPoints={successPlanTrendData.dataPoints}
                          metricName={successPlanTrendData.metricName}
                          valueSuffix="%"
                        />
                      </Stack>
                    ) : (
                      <Text c="dimmed">No trend data available</Text>
                    )
                  ) : successPlanData ? (
                    <Stack gap="lg">
                      <div>
                        <Group justify="space-between" mb="xs">
                          <Text fw={500}>Overall</Text>
                          <Text fw={700} size="xl">
                            {successPlanData.overall.toFixed(1)}%
                          </Text>
                        </Group>
                        <Progress value={successPlanData.overall} size="lg" radius="xl" />
                        <Text size="xs" c="dimmed" mt="xs">
                          {successPlanData.completed} of {successPlanData.total} epics completed on time
                        </Text>
                      </div>

                      <div>
                        <Text fw={500} mb="md">By Tier</Text>
                        <Stack gap="sm">
                          {(['TIER_1', 'TIER_2', 'TIER_3'] as const)
                            .filter(tier => !filters.tier || tier === filters.tier)
                            .map((tier) => (
                              <div key={tier}>
                                <Group justify="space-between" mb="xs">
                                  <Text size="sm">{tier.replace('_', ' ')}</Text>
                                  <Text fw={600}>{successPlanData.byTier[tier].toFixed(1)}%</Text>
                                </Group>
                                <Progress value={successPlanData.byTier[tier]} size="sm" radius="xl" />
                              </div>
                            ))}
                        </Stack>
                      </div>

                      {Object.keys(successPlanData.byPod).length > 0 && (
                        <div>
                          <Text fw={500} mb="md">By Pod</Text>
                          <Table>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Pod</Table.Th>
                                <Table.Th style={{ textAlign: 'right' }}>Completion Rate</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {Object.entries(successPlanData.byPod)
                                .sort(([, a], [, b]) => b - a)
                                .map(([pod, rate]) => (
                                  <Table.Tr key={pod}>
                                    <Table.Td>{pod}</Table.Td>
                                    <Table.Td style={{ textAlign: 'right' }}>
                                      <Badge color={rate >= 80 ? 'green' : rate >= 60 ? 'yellow' : 'red'}>
                                        {rate.toFixed(1)}%
                                      </Badge>
                                    </Table.Td>
                                  </Table.Tr>
                                ))}
                            </Table.Tbody>
                          </Table>
                        </div>
                      )}
                    </Stack>
                  ) : (
                    <Text c="dimmed">No data available</Text>
                  )}
                </Stack>
              </Card>

              {/* Metric 5: Retro Completion */}
              <Card withBorder>
                <Stack gap="md">
                  <Group justify="space-between" wrap="wrap">
                    <div>
                      <Title order={3} size="h4">
                        Metric 5: % Launches with Retro Completed On Time
                      </Title>
                      <Text c="dimmed" size="sm">
                        Percentage of epics where retro is completed by tier-specific due date (Tier 1: GA+14, Tier 2: GA+30, Tier 3: GA+45)
                      </Text>
                    </div>
                    <SegmentedControl
                      value={viewMode.retro}
                      onChange={(v) => setViewMode((prev) => ({ ...prev, retro: v as 'snapshot' | 'trends' }))}
                      data={[
                        { label: 'Snapshot', value: 'snapshot' },
                        { label: 'Trends', value: 'trends' },
                      ]}
                    />
                  </Group>

                  {viewMode.retro === 'trends' ? (
                    retroTrendData ? (
                      <Stack gap="xs">
                        <Text size="xs" c="dimmed">Last 6 months (by GA date)</Text>
                        <AnalyticsTrendChart
                          dataPoints={retroTrendData.dataPoints}
                          metricName={retroTrendData.metricName}
                          valueSuffix="%"
                        />
                      </Stack>
                    ) : (
                      <Text c="dimmed">No trend data available</Text>
                    )
                  ) : retroData ? (
                    <Stack gap="lg">
                      <div>
                        <Group justify="space-between" mb="xs">
                          <Text fw={500}>Overall</Text>
                          <Text fw={700} size="xl">
                            {retroData.overall.toFixed(1)}%
                          </Text>
                        </Group>
                        <Progress value={retroData.overall} size="lg" radius="xl" />
                        <Text size="xs" c="dimmed" mt="xs">
                          {retroData.completed} of {retroData.total} epics completed on time
                        </Text>
                      </div>

                      <div>
                        <Text fw={500} mb="md">By Tier</Text>
                        <Stack gap="sm">
                          {(['TIER_1', 'TIER_2', 'TIER_3'] as const)
                            .filter(tier => !filters.tier || tier === filters.tier)
                            .map((tier) => (
                              <div key={tier}>
                                <Group justify="space-between" mb="xs">
                                  <Text size="sm">
                                    {tier.replace('_', ' ')} (Due: GA + {tier === 'TIER_1' ? '14' : tier === 'TIER_2' ? '30' : '45'} days)
                                  </Text>
                                  <Text fw={600}>{retroData.byTier[tier].toFixed(1)}%</Text>
                                </Group>
                                <Progress value={retroData.byTier[tier]} size="sm" radius="xl" />
                              </div>
                            ))}
                        </Stack>
                      </div>

                      {Object.keys(retroData.byPod).length > 0 && (
                        <div>
                          <Text fw={500} mb="md">By Pod</Text>
                          <Table>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Pod</Table.Th>
                                <Table.Th style={{ textAlign: 'right' }}>Completion Rate</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {Object.entries(retroData.byPod)
                                .sort(([, a], [, b]) => b - a)
                                .map(([pod, rate]) => (
                                  <Table.Tr key={pod}>
                                    <Table.Td>{pod}</Table.Td>
                                    <Table.Td style={{ textAlign: 'right' }}>
                                      <Badge color={rate >= 80 ? 'green' : rate >= 60 ? 'yellow' : 'red'}>
                                        {rate.toFixed(1)}%
                                      </Badge>
                                    </Table.Td>
                                  </Table.Tr>
                                ))}
                            </Table.Tbody>
                          </Table>
                        </div>
                      )}
                    </Stack>
                  ) : (
                    <Text c="dimmed">No data available</Text>
                  )}
                </Stack>
              </Card>

              {/* Metric 3: Launch Hygiene Score */}
              <Card withBorder>
                <Stack gap="md">
                  <Group justify="space-between" wrap="wrap">
                    <div>
                      <Title order={3} size="h4">
                        Metric 3: Launch Hygiene Score (0-100)
                      </Title>
                      <Text c="dimmed" size="sm">
                        Weighted compliance score: Criteria completeness (50%) + Required signoffs (30%) + Cross-functional acknowledgements (20%)
                      </Text>
                    </div>
                    <SegmentedControl
                      value={viewMode.hygiene}
                      onChange={(v) => setViewMode((prev) => ({ ...prev, hygiene: v as 'snapshot' | 'trends' }))}
                      data={[
                        { label: 'Snapshot', value: 'snapshot' },
                        { label: 'Trends', value: 'trends' },
                      ]}
                    />
                  </Group>

                  {viewMode.hygiene === 'trends' ? (
                    hygieneTrendData ? (
                      <Stack gap="xs">
                        <Text size="xs" c="dimmed">Last 6 months (by GA date)</Text>
                        <AnalyticsTrendChart
                          dataPoints={hygieneTrendData.dataPoints}
                          metricName={hygieneTrendData.metricName}
                        />
                      </Stack>
                    ) : (
                      <Text c="dimmed">No trend data available</Text>
                    )
                  ) : hygieneData ? (
                    <Stack gap="lg">
                      <div>
                        <Group justify="space-between" mb="xs">
                          <Text fw={500}>Overall Average</Text>
                          <Text fw={700} size="xl">
                            {hygieneData.average.toFixed(1)}
                          </Text>
                        </Group>
                        <Group justify="space-between" mb="xs">
                          <Text fw={500}>Overall Median</Text>
                          <Text fw={600}>
                            {hygieneData.median.toFixed(1)}
                          </Text>
                        </Group>
                      </div>

                      <div>
                        <Text fw={500} mb="md">By Tier</Text>
                        <Table>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Tier</Table.Th>
                              <Table.Th style={{ textAlign: 'right' }}>Average</Table.Th>
                              <Table.Th style={{ textAlign: 'right' }}>Median</Table.Th>
                              <Table.Th style={{ textAlign: 'right' }}>Count</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {(['TIER_1', 'TIER_2', 'TIER_3'] as const)
                              .filter(tier => !filters.tier || tier === filters.tier)
                              .map((tier) => (
                                <Table.Tr key={tier}>
                                  <Table.Td>{tier.replace('_', ' ')}</Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    <Badge color={hygieneData.byTier[tier].average >= 80 ? 'green' : hygieneData.byTier[tier].average >= 60 ? 'yellow' : 'red'}>
                                      {hygieneData.byTier[tier].average.toFixed(1)}
                                    </Badge>
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>{hygieneData.byTier[tier].median.toFixed(1)}</Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>{hygieneData.byTier[tier].count}</Table.Td>
                                </Table.Tr>
                              ))}
                          </Table.Tbody>
                        </Table>
                      </div>
                    </Stack>
                  ) : (
                    <Text c="dimmed">No data available</Text>
                  )}
                </Stack>
              </Card>
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="timeliness" pt="md">
          {timelinessLoading && !criteriaTimelinessData && !pmTimelinessData ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <PurpleLoader />
            </div>
          ) : (
            <Stack gap="md">
              {/* Metric 6: Criteria On-Time Rate */}
              <Card withBorder>
                <Stack gap="md">
                  <div>
                    <Title order={3} size="h4">
                      Metric 6: Top 10 Chronically Late Criteria
                    </Title>
                    <Text c="dimmed" size="sm">
                      Criteria with lowest on-time completion rates and median days late
                    </Text>
                  </div>

                  {criteriaTimelinessData && criteriaTimelinessData.topLateCriteria.length > 0 ? (
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Criterion</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>On-Time %</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Total</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>On-Time</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Late</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Median Days Late</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {criteriaTimelinessData.topLateCriteria.map((criterion, idx) => (
                          <Table.Tr key={criterion.criterionId || idx}>
                            <Table.Td>{criterion.criterionName}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              <Badge color={criterion.onTimePercentage >= 80 ? 'green' : criterion.onTimePercentage >= 60 ? 'yellow' : 'red'}>
                                {criterion.onTimePercentage.toFixed(1)}%
                              </Badge>
                            </Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{criterion.totalInstances}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{criterion.completedOnTime}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{criterion.completedLate}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {criterion.medianDaysLate > 0 ? `${criterion.medianDaysLate.toFixed(1)} days` : '-'}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Text c="dimmed">No data available</Text>
                  )}
                </Stack>
              </Card>

              {/* Metric 7: PM Timeliness Index */}
              <Card withBorder>
                <Stack gap="md">
                  <div>
                    <Title order={3} size="h4">
                      Metric 7: PM Timeliness Index (0-100)
                    </Title>
                    <Text c="dimmed" size="sm">
                      Weighted score: Early (1.0) + On-time (0.8) + Late (0.3) + Missing (0.0) across PM-owned items (criteria + success plan + retro)
                    </Text>
                  </div>

                  {pmTimelinessData && pmTimelinessData.length > 0 ? (
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>PM</Table.Th>
                          <Table.Th>Pod</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Index</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Early</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>On-Time</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Late</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Missing</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Total</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {pmTimelinessData.map((pm) => (
                          <Table.Tr key={pm.pmEmail}>
                            <Table.Td>{pm.pmName}</Table.Td>
                            <Table.Td>{pm.pod}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              <Badge color={pm.index >= 80 ? 'green' : pm.index >= 60 ? 'yellow' : 'red'}>
                                {pm.index.toFixed(1)}
                              </Badge>
                            </Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{pm.early}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{pm.onTime}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{pm.late}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{pm.missing}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{pm.total}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Text c="dimmed">No data available</Text>
                  )}
                </Stack>
              </Card>
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="usage" pt="md">
          {usageLoading && !adoptionMetrics && !stickinessMetrics && !usageByRole && !usageTrends ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <PurpleLoader />
            </div>
          ) : (
            <Stack gap="md">
              {/* Adoption Overview */}
              <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                <Card withBorder>
                  <Stack gap="xs">
                    <Text size="sm" c="dimmed">Total Users</Text>
                    <Text fw={700} size="xl">
                      {adoptionMetrics?.totalUsers || 0}
                    </Text>
                  </Stack>
                </Card>
                <Card withBorder>
                  <Stack gap="xs">
                    <Text size="sm" c="dimmed">Active (7d)</Text>
                    <Text fw={700} size="xl">
                      {adoptionMetrics?.activeUsers7d || 0}
                    </Text>
                  </Stack>
                </Card>
                <Card withBorder>
                  <Stack gap="xs">
                    <Text size="sm" c="dimmed">Active (30d)</Text>
                    <Text fw={700} size="xl">
                      {adoptionMetrics?.activeUsers30d || 0}
                    </Text>
                  </Stack>
                </Card>
                <Card withBorder>
                  <Stack gap="xs">
                    <Text size="sm" c="dimmed">New This Month</Text>
                    <Text fw={700} size="xl">
                      {adoptionMetrics?.newUsersThisMonth || 0}
                    </Text>
                  </Stack>
                </Card>
              </SimpleGrid>

              {/* Stickiness Metrics */}
              <Card withBorder>
                <Stack gap="md">
                  <Title order={3} size="h4">
                    Stickiness Metrics
                  </Title>
                  {stickinessMetrics ? (
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                      <div>
                        <Text size="sm" c="dimmed">DAU/MAU Ratio</Text>
                        <Text fw={600} size="lg">
                          {stickinessMetrics.dauMauRatio.toFixed(1)}%
                        </Text>
                      </div>
                      <div>
                        <Text size="sm" c="dimmed">WAU/MAU Ratio</Text>
                        <Text fw={600} size="lg">
                          {stickinessMetrics.wauMauRatio.toFixed(1)}%
                        </Text>
                      </div>
                      <div>
                        <Text size="sm" c="dimmed">Daily Active Users</Text>
                        <Text fw={600} size="lg">
                          {stickinessMetrics.dailyActiveUsers}
                        </Text>
                      </div>
                      <div>
                        <Text size="sm" c="dimmed">Monthly Active Users</Text>
                        <Text fw={600} size="lg">
                          {stickinessMetrics.monthlyActiveUsers}
                        </Text>
                      </div>
                    </SimpleGrid>
                  ) : (
                    <Text c="dimmed">No data available</Text>
                  )}
                </Stack>
              </Card>

              {/* Usage by Role */}
              <Card withBorder>
                <Stack gap="md">
                  <Title order={3} size="h4">
                    Usage by Role
                  </Title>
                  {usageByRole && usageByRole.length > 0 ? (
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Role</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Total Users</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Active (7d)</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Active (30d)</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Total Logins</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {usageByRole.map((role) => (
                          <Table.Tr key={role.role}>
                            <Table.Td>{role.role}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{role.totalUsers}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{role.activeUsers7d}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{role.activeUsers30d}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{role.loginCount}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Text c="dimmed">No data available</Text>
                  )}
                </Stack>
              </Card>

              {/* User Activity Trends */}
              {usageTrends && usageTrends.dataPoints.length > 0 && (
                <Card withBorder>
                  <Stack gap="md">
                    <Title order={3} size="h4">
                      User Activity Trends
                    </Title>
                    <AnalyticsTrendChart
                      dataPoints={usageTrends.dataPoints.map(dp => ({
                        month: dp.date,
                        value: dp.activeUsers,
                      }))}
                      metricName="Daily Active Users"
                    />
                  </Stack>
                </Card>
              )}
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="notifications" pt="md">
          {notificationsLoading && !notifications ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <PurpleLoader />
            </div>
          ) : (
            <Card withBorder>
              <Stack gap="md">
                <div>
                  <Title order={3} size="h4">
                    Recent Notifications
                  </Title>
                  <Text c="dimmed" size="sm">
                    Last 50 notifications sent via Slack, email, and other channels
                  </Text>
                </div>

                {notifications && notifications.length > 0 ? (
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Sent At</Table.Th>
                        <Table.Th>Category</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Channel</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Recipient</Table.Th>
                        <Table.Th>Epic</Table.Th>
                        <Table.Th>Error</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {notifications.map((notification) => {
                        const sentAt = notification.sent_at 
                          ? new Date(notification.sent_at).toLocaleString()
                          : '-';
                        const recipient = notification.app_user 
                          ? (notification.app_user.name || notification.app_user.email || 'Unknown')
                          : '-';
                        const epicName = notification.epic?.name || '-';
                        const error = notification.error || '-';
                        
                        // Categorize notification
                        const assignmentTypes = ['criteria_assignment', 'delegation'];
                        const reminderTypes = ['criteria_nudge', 'retro_reminder', 'success_review_reminder'];
                        const notificationType = notification.type || '';
                        const category = assignmentTypes.includes(notificationType)
                          ? 'Assignment'
                          : reminderTypes.includes(notificationType)
                          ? 'Reminder'
                          : 'Other';

                        return (
                          <Table.Tr key={notification.id}>
                            <Table.Td>
                              <Text size="sm">{sentAt}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge
                                color={
                                  category === 'Assignment'
                                    ? 'blue'
                                    : category === 'Reminder'
                                    ? 'orange'
                                    : 'gray'
                                }
                                variant="light"
                              >
                                {category}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light" color="blue">
                                {notification.type || '-'}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light" color="gray">
                                {notification.delivery_channel || '-'}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Badge
                                color={
                                  notification.status === 'sent'
                                    ? 'green'
                                    : notification.status === 'failed'
                                    ? 'red'
                                    : 'yellow'
                                }
                              >
                                {notification.status || 'pending'}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{recipient}</Text>
                            </Table.Td>
                            <Table.Td>
                              {notification.epic_id ? (
                                <Link
                                  href={`/epics/${notification.epic_id}`}
                                  style={{ textDecoration: 'none' }}
                                >
                                  <Text size="sm" c="blue" style={{ textDecoration: 'underline' }}>
                                    {epicName}
                                  </Text>
                                </Link>
                              ) : (
                                <Text size="sm" c="dimmed">-</Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              {error !== '-' ? (
                                <Text size="xs" c="red" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={error}>
                                  {error}
                                </Text>
                              ) : (
                                <Text size="sm" c="dimmed">-</Text>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Text c="dimmed">No notifications found</Text>
                )}
              </Stack>
            </Card>
          )}
        </Tabs.Panel>
          </Tabs>
        </Stack>
      </div>
    </div>
  );
}
