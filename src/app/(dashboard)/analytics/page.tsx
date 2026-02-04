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

export default function AnalyticsDashboardPage() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [successPlanData, setSuccessPlanData] = useState<SuccessPlanCompletionRate | null>(null);
  const [retroData, setRetroData] = useState<RetroCompletionRate | null>(null);
  const [hygieneData, setHygieneData] = useState<LaunchHygieneDistribution | null>(null);
  const [criteriaTimelinessData, setCriteriaTimelinessData] = useState<CriteriaOnTimeStats | null>(null);
  const [pmTimelinessData, setPMTimelinessData] = useState<PMTimelinessStats[] | null>(null);
  const [successPlanTrendData, setSuccessPlanTrendData] = useState<TimeSeriesData | null>(null);
  const [retroTrendData, setRetroTrendData] = useState<TimeSeriesData | null>(null);
  const [hygieneTrendData, setHygieneTrendData] = useState<TimeSeriesData | null>(null);
  const [loading, setLoading] = useState(true);

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
  });

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
    if (!hasAccess) return;
    fetchDashboardData();
  }, [hasAccess, filters, viewMode.successPlan, viewMode.retro, viewMode.hygiene]);

  const fetchDashboardData = async () => {
    setLoading(true);
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

      const [successPlanRes, retroRes, hygieneRes, criteriaRes, pmRes] = await Promise.all([
        fetchWithRateLimit(`/api/analytics/success-plan-completion?${successPlanParams.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/analytics/retro-completion?${retroParams.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/analytics/launch-hygiene?${hygieneParams.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/analytics/criteria-timeliness?${baseParams.toString()}`, { maxRetries: 1 }),
        fetchWithRateLimit(`/api/analytics/pm-timeliness?${baseParams.toString()}`, { maxRetries: 1 }),
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

      if (criteriaRes.ok) {
        const data = await criteriaRes.json();
        setCriteriaTimelinessData(data);
      }

      if (pmRes.ok) {
        const data = await pmRes.json();
        setPMTimelinessData(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch analytics data:', error);
    } finally {
      setLoading(false);
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

  if (loading && !successPlanData && !retroData && !hygieneData && !criteriaTimelinessData && !pmTimelinessData) {
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
          <Title order={1} style={{ margin: 0 }}>
            Analytics Dashboard
          </Title>
          <Text c="dimmed" size="sm" style={{ marginTop: '0.5rem' }}>
            ClearGO Analytics v1 - Adoption, Compliance, Timeliness, Outcomes
          </Text>
        </div>
        <Button
          leftSection={<IconRefresh size={16} />}
          onClick={fetchDashboardData}
          variant="light"
        >
          Refresh
        </Button>
      </Group>

      {/* Filters */}
      <Card withBorder>
        <Stack gap="md">
          <Title order={3} size="h4">
            Filters
          </Title>
          <Group>
            <Select
              label="Tier"
              placeholder="All tiers"
              data={[
                { value: '', label: 'All tiers' },
                { value: 'TIER_1', label: 'Tier 1' },
                { value: 'TIER_2', label: 'Tier 2' },
                { value: 'TIER_3', label: 'Tier 3' },
              ]}
              value={filters.tier}
              onChange={(value) => setFilters({ ...filters, tier: value || '' })}
              clearable
              style={{ flex: 1 }}
            />
            <TextInput
              label="Pod"
              placeholder="Filter by pod"
              value={filters.pod}
              onChange={(e) => setFilters({ ...filters, pod: e.target.value })}
              style={{ flex: 1 }}
            />
            <TextInput
              label="Date Range Start"
              type="date"
              value={filters.dateRangeStart}
              onChange={(e) => setFilters({ ...filters, dateRangeStart: e.target.value })}
              style={{ flex: 1 }}
            />
            <TextInput
              label="Date Range End"
              type="date"
              value={filters.dateRangeEnd}
              onChange={(e) => setFilters({ ...filters, dateRangeEnd: e.target.value })}
              style={{ flex: 1 }}
            />
          </Group>
        </Stack>
      </Card>

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
                  {(['TIER_1', 'TIER_2', 'TIER_3'] as const).map((tier) => (
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
                  {(['TIER_1', 'TIER_2', 'TIER_3'] as const).map((tier) => (
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
                    {(['TIER_1', 'TIER_2', 'TIER_3'] as const).map((tier) => (
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
  );
}
