"use client";

import { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Badge,
    Group,
    Text,
    Button,
    Stack,
    Title,
    Alert,
    Progress,
} from '@mantine/core';
import { IconRefresh, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import { PurpleLoader } from '@/components/PurpleLoader';

interface PerformanceStats {
    summary: {
        totalRequests: number;
        totalRemaining: number;
        activeIdentifiers: number;
        rateLimitExceeded: number;
        timestamp: string;
    };
    byType: Record<string, number>;
    topIdentifiers: Array<{
        identifier: string;
        count: number;
        remaining: number;
        resetTime: string;
        percentageUsed: number;
    }>;
    allStats: Array<{
        identifier: string;
        count: number;
        remaining: number;
        resetTime: string;
        maxRequests: number;
        percentageUsed: number;
    }>;
}

export default function PerformancePage() {
    const [stats, setStats] = useState<PerformanceStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithRateLimit('/api/admin/performance', {
                credentials: 'include',
            });

            if (!res.ok) {
                if (res.status === 403) {
                    throw new Error('You do not have permission to view performance metrics');
                }
                if (res.status === 401) {
                    throw new Error('Please log in to view performance metrics');
                }
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to fetch performance stats (${res.status})`);
            }

            const data = await res.json();
            setStats(data);
        } catch (err: any) {
            console.error('Error fetching performance stats:', err);
            setError(err.message || 'Failed to fetch performance statistics');
            notifications.show({
                title: 'Error',
                message: err.message || 'Failed to fetch performance statistics',
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        // Refresh every 30 seconds
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !stats) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <PurpleLoader size="lg" />
            </div>
        );
    }

    if (error && !stats) {
        return (
            <div className="p-6">
                <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
                    {error}
                </Alert>
                <Button onClick={fetchStats} mt="md" leftSection={<IconRefresh size={16} />}>
                    Retry
                </Button>
            </div>
        );
    }

    if (!stats) {
        return null;
    }

    const formatTime = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleString();
    };

    const getPercentageColor = (percentage: number) => {
        if (percentage >= 90) return 'red';
        if (percentage >= 70) return 'yellow';
        return 'green';
    };

    return (
        <div className="space-y-6">
            <Group justify="space-between" align="center">
                <div>
                    <Title order={2} style={{ fontFamily: 'var(--font-heading)' }}>
                        Performance Monitoring
                    </Title>
                    <Text size="sm" c="dimmed" mt="xs">
                        Monitor API rate limits and system performance metrics
                    </Text>
                </div>
                <Button
                    onClick={fetchStats}
                    leftSection={<IconRefresh size={16} />}
                    loading={loading}
                >
                    Refresh
                </Button>
            </Group>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                    <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                        Total Requests
                    </Text>
                    <Text size="xl" fw={700} mt="xs">
                        {stats.summary.totalRequests.toLocaleString()}
                    </Text>
                </Card>

                <Card shadow="sm" padding="lg" radius="md" withBorder>
                    <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                        Remaining Capacity
                    </Text>
                    <Text size="xl" fw={700} mt="xs" c="green">
                        {stats.summary.totalRemaining.toLocaleString()}
                    </Text>
                </Card>

                <Card shadow="sm" padding="lg" radius="md" withBorder>
                    <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                        Active Identifiers
                    </Text>
                    <Text size="xl" fw={700} mt="xs">
                        {stats.summary.activeIdentifiers}
                    </Text>
                </Card>

                <Card shadow="sm" padding="lg" radius="md" withBorder>
                    <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                        Rate Limit Exceeded
                    </Text>
                    <Text size="xl" fw={700} mt="xs" c={stats.summary.rateLimitExceeded > 0 ? 'red' : 'green'}>
                        {stats.summary.rateLimitExceeded}
                    </Text>
                </Card>
            </div>

            {/* Alerts */}
            {stats.summary.rateLimitExceeded > 0 && (
                <Alert icon={<IconAlertCircle size={16} />} title="Rate Limits Exceeded" color="red">
                    {stats.summary.rateLimitExceeded} identifier{stats.summary.rateLimitExceeded !== 1 ? 's' : ''} have exceeded their rate limits.
                </Alert>
            )}

            {stats.summary.totalRemaining < stats.summary.totalRequests * 0.1 && (
                <Alert icon={<IconAlertCircle size={16} />} title="High Usage" color="yellow">
                    System is using {Math.round((stats.summary.totalRequests / (stats.summary.totalRequests + stats.summary.totalRemaining)) * 100)}% of available rate limit capacity.
                </Alert>
            )}

            {/* Requests by Type */}
            {Object.keys(stats.byType).length > 0 && (
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                    <Title order={3} mb="md" style={{ fontFamily: 'var(--font-heading)' }}>
                        Requests by Type
                    </Title>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Type</Table.Th>
                                <Table.Th>Request Count</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {Object.entries(stats.byType)
                                .sort(([, a], [, b]) => b - a)
                                .map(([type, count]) => (
                                    <Table.Tr key={type}>
                                        <Table.Td>
                                            <Badge variant="light">{type}</Badge>
                                        </Table.Td>
                                        <Table.Td>{count.toLocaleString()}</Table.Td>
                                    </Table.Tr>
                                ))}
                        </Table.Tbody>
                    </Table>
                </Card>
            )}

            {/* Top Identifiers */}
            <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md" style={{ fontFamily: 'var(--font-heading)' }}>
                    Top Identifiers by Request Count
                </Title>
                {stats.topIdentifiers.length === 0 ? (
                    <Text c="dimmed">No active rate limit entries</Text>
                ) : (
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Identifier</Table.Th>
                                <Table.Th>Requests</Table.Th>
                                <Table.Th>Remaining</Table.Th>
                                <Table.Th>Usage</Table.Th>
                                <Table.Th>Reset Time</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {stats.topIdentifiers.map((item) => (
                                <Table.Tr key={item.identifier}>
                                    <Table.Td>
                                        <Text size="sm" style={{ fontFamily: 'monospace' }}>
                                            {item.identifier.length > 50
                                                ? `${item.identifier.substring(0, 50)}...`
                                                : item.identifier}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>{item.count}</Table.Td>
                                    <Table.Td>
                                        <Badge color={item.remaining > 20 ? 'green' : item.remaining > 0 ? 'yellow' : 'red'}>
                                            {item.remaining}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap="xs">
                                            <Progress
                                                value={item.percentageUsed}
                                                color={getPercentageColor(item.percentageUsed)}
                                                size="sm"
                                                style={{ flex: 1, minWidth: 100 }}
                                            />
                                            <Text size="xs" c="dimmed">
                                                {item.percentageUsed}%
                                            </Text>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="xs">{formatTime(item.resetTime)}</Text>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                )}
            </Card>

            {/* Last Updated */}
            <Text size="xs" c="dimmed" ta="right">
                Last updated: {formatTime(stats.summary.timestamp)}
            </Text>
        </div>
    );
}
