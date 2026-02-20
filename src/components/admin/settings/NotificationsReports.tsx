"use client";

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Stack,
  Group,
  Button,
  Card,
  Text,
  Title,
  Table,
  Select,
  TextInput,
  Box,
  SimpleGrid,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { PurpleLoader } from '@/components/PurpleLoader';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';

type NotificationFilters = {
  type: string;
  channel: string;
  status: string;
  dateRangeStart: string;
  dateRangeEnd: string;
};

export default function NotificationsReports() {
  const [notifications, setNotifications] = useState<any[] | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [filters, setFilters] = useState<NotificationFilters>({
    type: '',
    channel: '',
    status: '',
    dateRangeStart: '',
    dateRangeEnd: '',
  });

  const fetchNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '50');
      if (filters.type) params.append('type', filters.type);
      if (filters.channel) params.append('channel', filters.channel);
      if (filters.status) params.append('status', filters.status);
      if (filters.dateRangeStart) params.append('date_range_start', filters.dateRangeStart);
      if (filters.dateRangeEnd) params.append('date_range_end', filters.dateRangeEnd);

      const res = await fetchWithRateLimit(`/api/analytics/notifications?${params.toString()}`, { maxRetries: 1 });
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
  }, [filters]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleRefresh = () => {
    fetchNotifications();
  };

  // Get unique values for filter options
  const notificationTypes = Array.from(new Set(notifications?.map(n => n.type).filter(Boolean) || [])).sort();
  const channels = Array.from(new Set(notifications?.map(n => n.delivery_channel).filter(Boolean) || [])).sort();
  const statuses = Array.from(new Set(notifications?.map(n => n.status).filter(Boolean) || [])).sort();

  // Filter notifications client-side (in case API doesn't support all filters)
  const filteredNotifications = notifications?.filter(notification => {
    if (filters.type && notification.type !== filters.type) return false;
    if (filters.channel && notification.delivery_channel !== filters.channel) return false;
    if (filters.status && notification.status !== filters.status) return false;
    if (filters.dateRangeStart) {
      const sentDate = notification.sent_at ? new Date(notification.sent_at).toISOString().split('T')[0] : '';
      if (sentDate < filters.dateRangeStart) return false;
    }
    if (filters.dateRangeEnd) {
      const sentDate = notification.sent_at ? new Date(notification.sent_at).toISOString().split('T')[0] : '';
      if (sentDate > filters.dateRangeEnd) return false;
    }
    return true;
  }) || [];

  // Calculate statistics
  const totalNotifications = filteredNotifications.length;
  const byStatus = filteredNotifications.reduce((acc, n) => {
    const status = n.status || 'pending';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const byChannel = filteredNotifications.reduce((acc, n) => {
    const channel = n.delivery_channel || 'unknown';
    acc[channel] = (acc[channel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const failedCount = byStatus['failed'] || 0;
  const successRate = totalNotifications > 0 
    ? ((byStatus['sent'] || 0) / totalNotifications * 100).toFixed(1)
    : '0';

  return (
    <div style={{ marginRight: '-64px' }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900">Notifications Log</h2>
          <p className="text-sm text-gray-500">View recent notifications sent via Slack, email, and other channels</p>
        </div>
        <Button
          leftSection={<IconRefresh size={16} />}
          onClick={handleRefresh}
          variant="light"
          loading={notificationsLoading}
        >
          Refresh
        </Button>
      </div>

      {/* Summary Statistics */}
      <Card withBorder mb="lg">
        <SimpleGrid cols={{ base: 2, sm: 4, md: 6 }} spacing="md">
          <div>
            <Text size="sm" c="dimmed">Total Notifications</Text>
            <Text size="xl" fw={700}>{totalNotifications}</Text>
          </div>
          
          <div>
            <Text size="sm" c="dimmed">Success Rate</Text>
            <Text size="xl" fw={700}>{successRate}%</Text>
          </div>
          
          <div>
            <Text size="sm" c="dimmed">Failed</Text>
            <Text size="xl" fw={700} c={failedCount > 0 ? 'red' : undefined}>{failedCount}</Text>
          </div>

          {Object.keys(byStatus).length > 0 && (Object.entries(byStatus) as [string, number][])
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([status, count]) => (
              <div key={status}>
                <Text size="sm" c="dimmed">{status}</Text>
                <Text size="xl" fw={700}>{count}</Text>
              </div>
            ))}
        </SimpleGrid>
      </Card>

      {/* Filters */}
      <Group mb="lg" align="flex-end" gap="sm" wrap="nowrap">
        <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)', flexShrink: 0 }}>Filters:</Text>
        <Box
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 0',
            flex: 1,
            overflowX: 'auto'
          }}
        >
          <Select
            placeholder="All Types"
            data={[
              { value: '', label: 'All Types' },
              ...notificationTypes.map(type => ({ value: type, label: type }))
            ]}
            value={filters.type}
            onChange={(value) => setFilters({ ...filters, type: value || '' })}
            clearable
            style={{ minWidth: 120, flexShrink: 0 }}
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
            placeholder="All Channels"
            data={[
              { value: '', label: 'All Channels' },
              ...channels.map(channel => ({ value: channel, label: channel }))
            ]}
            value={filters.channel}
            onChange={(value) => setFilters({ ...filters, channel: value || '' })}
            clearable
            style={{ minWidth: 120, flexShrink: 0 }}
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
            placeholder="All Statuses"
            data={[
              { value: '', label: 'All Statuses' },
              ...statuses.map(status => ({ value: status, label: status }))
            ]}
            value={filters.status}
            onChange={(value) => setFilters({ ...filters, status: value || '' })}
            clearable
            style={{ minWidth: 110, flexShrink: 0 }}
            styles={{
              input: {
                borderRadius: 8,
                border: '1px solid var(--color-gray-300)',
                backgroundColor: 'var(--color-gray-50)',
                fontFamily: 'var(--font-body)'
              }
            }}
          />
          <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'flex-end', flexShrink: 0 }}>
            <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--font-body)', lineHeight: 1, height: '16px' }}>From</Text>
            <TextInput
              type="date"
              value={filters.dateRangeStart}
              onChange={(e) => setFilters({ ...filters, dateRangeStart: e.target.value })}
              style={{ minWidth: 140 }}
              styles={{
                input: {
                  borderRadius: 8,
                  border: '1px solid var(--color-gray-300)',
                  fontFamily: 'var(--font-body)'
                }
              }}
            />
          </Box>
          <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'flex-end', flexShrink: 0 }}>
            <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--font-body)', lineHeight: 1, height: '16px' }}>To</Text>
            <TextInput
              type="date"
              value={filters.dateRangeEnd}
              onChange={(e) => setFilters({ ...filters, dateRangeEnd: e.target.value })}
              style={{ minWidth: 140 }}
              styles={{
                input: {
                  borderRadius: 8,
                  border: '1px solid var(--color-gray-300)',
                  fontFamily: 'var(--font-body)'
                }
              }}
            />
          </Box>
        </Box>
      </Group>

      <Card withBorder>
        <Stack gap="md">
          {notificationsLoading && !notifications ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <PurpleLoader />
            </div>
          ) : filteredNotifications.length > 0 ? (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: '180px' }}>Sent At</Table.Th>
                  <Table.Th style={{ width: '200px' }}>Type</Table.Th>
                  <Table.Th style={{ width: '120px' }}>Channel</Table.Th>
                  <Table.Th style={{ width: '100px' }}>Status</Table.Th>
                  <Table.Th style={{ width: '200px' }}>Recipient</Table.Th>
                  <Table.Th style={{ width: '250px' }}>Epic</Table.Th>
                  <Table.Th>Error</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredNotifications.map((notification) => {
                  const sentAt = notification.sent_at 
                    ? new Date(notification.sent_at).toLocaleString()
                    : '-';
                  const recipient = notification.app_user 
                    ? (notification.app_user.name || notification.app_user.email || 'Unknown')
                    : '-';
                  const epicName = notification.epic?.name || '-';
                  const error = notification.error || '-';

                  return (
                    <Table.Tr key={notification.id}>
                      <Table.Td style={{ width: '180px' }}>
                        <Text size="sm">{sentAt}</Text>
                      </Table.Td>
                      <Table.Td style={{ width: '200px' }}>
                        <Text size="sm">{notification.type || '-'}</Text>
                      </Table.Td>
                      <Table.Td style={{ width: '120px' }}>
                        <Text size="sm">{notification.delivery_channel || '-'}</Text>
                      </Table.Td>
                      <Table.Td style={{ width: '100px' }}>
                        <Text size="sm">{notification.status || 'pending'}</Text>
                      </Table.Td>
                      <Table.Td style={{ width: '200px' }}>
                        <Text size="sm">{recipient}</Text>
                      </Table.Td>
                      <Table.Td style={{ width: '250px' }}>
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
                          <Text size="xs" c="red" style={{ maxWidth: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={error}>
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
    </div>
  );
}
