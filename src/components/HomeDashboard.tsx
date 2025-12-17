'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Title, Text, SimpleGrid, Group, Box } from '@mantine/core';
import {
  IconBolt,
  IconFolderCheck,
  IconAlertTriangle,
  IconChevronRight,
} from '@tabler/icons-react';
import { ActivityFeed } from './ActivityFeed';

interface DashboardMetrics {
  activeEpics: number;
  pendingItems: number;
  releasesNeedingFeedback: number;
  highRiskEpics: number;
}

interface HomeDashboardProps {
  userEmail?: string | null;
  firstName?: string | null;
  enableActivityFeed?: boolean;
}

type SafeResponse = Response | { ok: false; json: () => Promise<null> };

export function HomeDashboard({
  userEmail,
  firstName,
  enableActivityFeed = true,
}: HomeDashboardProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    activeEpics: 0,
    pendingItems: 0,
    releasesNeedingFeedback: 0,
    highRiskEpics: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      const safeFetch = async (url: string): Promise<SafeResponse> => {
        try {
          return await fetch(url, { credentials: 'include' });
        } catch {
          return { ok: false as const, json: async () => null };
        }
      };

      try {
        const [epicsRes, myItemsRes, feedbackRes] = await Promise.all([
          safeFetch('/api/epics'),
          safeFetch('/api/my-items'),
          safeFetch('/api/dashboard/releases-needing-feedback'),
        ]);

        let activeEpics = 0;
        let highRiskEpics = 0;
        let pendingItems = 0;
        let releasesNeedingFeedback = 0;

        if (epicsRes.ok) {
          try {
            const epics = await epicsRes.json();
            if (Array.isArray(epics)) {
              activeEpics = epics.filter(
                (epic: any) => epic.readiness_status !== 'COMPLETED' && epic.status !== 'COMPLETED'
              ).length;
              highRiskEpics = epics.filter((epic: any) => epic.risk_level === 'HIGH').length;
            }
          } catch (e) {
            console.warn('Error parsing epics response:', e);
          }
        }

        if (myItemsRes.ok) {
          try {
            const items = await myItemsRes.json();
            if (Array.isArray(items)) {
              pendingItems = items.filter((item: any) => {
                const status = item.criterion?.status || item.status;
                return status !== 'COMPLETE' && status !== 'COMPLETED';
              }).length;
            }
          } catch (e) {
            console.warn('Error parsing my-items response:', e);
          }
        }

        if (feedbackRes.ok) {
          try {
            const feedbackData = await feedbackRes.json();
            releasesNeedingFeedback = feedbackData.count || 0;
          } catch (e) {
            console.warn('Error parsing feedback response:', e);
          }
        }

        setMetrics({
          activeEpics,
          pendingItems,
          releasesNeedingFeedback,
          highRiskEpics,
        });
      } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, []);

  const displayName = firstName || userEmail?.split('@')[0] || 'dev';

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          style={{
            display: 'flex',
            gap: '24px',
            alignItems: 'flex-start',
            flexDirection: enableActivityFeed ? undefined : 'column',
          }}
        >
          {/* Main Content */}
          <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
            {/* Welcome Section */}
            <div className="mb-8">
              <Title
                order={1}
                className="text-4xl font-bold mb-2"
                style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}
              >
                Welcome back, <span className="text-indigo-600">{displayName}</span>
              </Title>
              <Text
                size="lg"
                className="text-gray-600"
                style={{ fontFamily: "'Public Sans', sans-serif" }}
              >
                Manage your epics, track readiness criteria, and ensure successful go-to-market
                execution.
              </Text>
            </div>

            {/* Action Cards */}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" className="mb-8">
              {/* Epics Card */}
              <Card
                shadow="sm"
                padding="md"
                radius="md"
                withBorder
                className="hover:shadow-md transition-shadow cursor-pointer"
                component={Link}
                href="/epics"
                style={{
                  minHeight: '160px',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Group justify="space-between" align="flex-start" mb="sm">
                    <Box
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        backgroundColor: '#EFF6FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconBolt size={20} color="#3B82F6" />
                    </Box>
                    <Box
                      style={{
                        width: 24,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconChevronRight size={20} color="#6366F1" />
                    </Box>
                  </Group>
                  <Title order={3} className="text-lg font-bold mb-1">
                    Epics
                  </Title>
                  <Text size="sm" className="text-gray-600 mb-3" style={{ flex: 1 }}>
                    {loading
                      ? 'Loading...'
                      : `${metrics.activeEpics} active epic${metrics.activeEpics !== 1 ? 's' : ''}`}
                  </Text>
                </Box>
              </Card>

              {/* My Items Card */}
              <Card
                shadow="sm"
                padding="md"
                radius="md"
                withBorder
                className="hover:shadow-md transition-shadow cursor-pointer"
                component={Link}
                href="/my-items"
                style={{
                  minHeight: '160px',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Group justify="space-between" align="flex-start" mb="sm">
                    <Box
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        backgroundColor: '#F3E8FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconFolderCheck size={20} color="#9333EA" />
                    </Box>
                    <Box
                      style={{
                        width: 24,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconChevronRight size={20} color="#6366F1" />
                    </Box>
                  </Group>
                  <Title order={3} className="text-lg font-bold mb-1">
                    My Items
                  </Title>
                  <Text size="sm" className="text-gray-600 mb-3" style={{ flex: 1 }}>
                    {loading
                      ? 'Loading...'
                      : `${metrics.pendingItems} item${metrics.pendingItems !== 1 ? 's' : ''} need${metrics.pendingItems === 1 ? 's' : ''} my attention`}
                  </Text>
                </Box>
              </Card>
            </SimpleGrid>

            {/* Metric Cards */}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
              {/* High Risk Epics */}
              <Card
                shadow="sm"
                padding="md"
                radius="md"
                withBorder
                style={{ minHeight: '160px', height: '100%' }}
              >
                <Group justify="space-between" align="center" style={{ height: '100%' }}>
                  <div>
                    <Text size="sm" className="text-gray-600 mb-1">
                      High Risk Epics
                    </Text>
                    <Title order={2} className="text-2xl font-bold">
                      {loading ? '-' : metrics.highRiskEpics}
                    </Title>
                  </div>
                  <Box
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: '#FEE2E2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IconAlertTriangle size={18} color="#EF4444" />
                  </Box>
                </Group>
              </Card>

              {/* Releases Needing Feedback */}
              <Card
                shadow="sm"
                padding="md"
                radius="md"
                withBorder
                style={{ minHeight: '160px', height: '100%' }}
              >
                <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Group justify="space-between" align="flex-start" mb="sm">
                    <div>
                      <Text size="sm" className="text-gray-600 mb-1">
                        Releases Needing Feedback
                      </Text>
                      <Title order={2} className="text-2xl font-bold">
                        {loading ? '-' : metrics.releasesNeedingFeedback}
                      </Title>
                      <Text size="xs" className="text-gray-500" style={{ marginTop: 'auto' }}>
                        Launched less than 90 days ago
                      </Text>
                    </div>
                    <Box
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        backgroundColor: '#FEF3C7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconFolderCheck size={18} color="#F59E0B" />
                    </Box>
                  </Group>
                </Box>
              </Card>
            </SimpleGrid>
          </div>

          {/* Activity Feed Sidebar */}
          {enableActivityFeed && (
            <div
              style={{
                width: '380px',
                flexShrink: 0,
                position: 'sticky',
                top: '100px',
                height: 'calc(100vh - 120px)',
                marginTop: '108px',
              }}
              className="hidden lg:block"
            >
              <Box style={{ height: '100%' }}>
                <ActivityFeed />
              </Box>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
