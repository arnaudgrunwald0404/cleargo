"use client";

import { useEffect, useState } from 'react';
import { Card, Text, Stack, Group, Avatar, Badge, ScrollArea, Box } from '@mantine/core';
import { PurpleLoader } from './PurpleLoader';
import { IconBolt, IconFolderCheck, IconCalendar, IconMessage } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { ActivityFeedItem } from '@/app/api/activity-feed/route';

export function ActivityFeed() {
    const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        fetchActivities();
    }, []);

    const fetchActivities = async () => {
        try {
            const res = await fetch('/api/activity-feed?limit=15', { credentials: 'include' });
            if (!res.ok) {
                throw new Error('Failed to fetch activities');
            }
            const data = await res.json();
            setActivities(data.activities || []);
        } catch (error) {
            console.error('Error fetching activities:', error);
        } finally {
            setLoading(false);
        }
    };

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'criterion_change':
                return <IconFolderCheck size={16} color="#9333EA" />;
            case 'epic_added':
                return <IconBolt size={16} color="#3B82F6" />;
            case 'release_updated':
                return <IconCalendar size={16} color="#10B981" />;
            case 'feedback_added':
                return <IconMessage size={16} color="#F59E0B" />;
            default:
                return <IconBolt size={16} color="#6B7280" />;
        }
    };

    const getActivityColor = (type: string) => {
        switch (type) {
            case 'criterion_change':
                return 'violet';
            case 'epic_added':
                return 'blue';
            case 'release_updated':
                return 'green';
            case 'feedback_added':
                return 'yellow';
            default:
                return 'gray';
        }
    };

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const getActorDisplay = (actor: ActivityFeedItem['actor']) => {
        if (!actor) return 'System';
        return actor.first_name && actor.last_name
            ? `${actor.first_name} ${actor.last_name}`
            : actor.name || actor.email?.split('@')[0] || 'Unknown';
    };

    const getActorInitials = (actor: ActivityFeedItem['actor']) => {
        if (!actor) return 'S';
        if (actor.first_name && actor.last_name) {
            return `${actor.first_name[0]}${actor.last_name[0]}`.toUpperCase();
        }
        if (actor.name) {
            const parts = actor.name.split(' ');
            return parts.length > 1 
                ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
                : actor.name.substring(0, 2).toUpperCase();
        }
        if (actor.email) {
            return actor.email.substring(0, 2).toUpperCase();
        }
        return 'U';
    };

    const getActivityUrl = (activity: ActivityFeedItem): string | null => {
        // Epic or Launch activities -> epic detail page
        if ((activity.entity_type === 'epic' || activity.entity_type === 'launch') && activity.entity_id) {
            return `/epics/${activity.entity_id}`;
        }
        
        // Feedback activities -> epic detail page (if epic_id is available)
        if (activity.type === 'feedback_added' && activity.epic_id) {
            return `/epics/${activity.epic_id}`;
        }
        
        // Criterion status changes -> epic detail page (if epic_id is available)
        if (activity.type === 'criterion_change' && activity.epic_id) {
            return `/epics/${activity.epic_id}`;
        }
        
        // Criterion changes without epic_id -> criteria admin page
        if (activity.type === 'criterion_change' && activity.entity_type === 'criterion') {
            return '/admin/criteria';
        }
        
        // Delegation activities -> try to get epic_id from entity_id if it's a delegation
        // For now, delegation might not have epic_id, so we'll skip it
        
        return null;
    };

    const handleActivityClick = (activity: ActivityFeedItem) => {
        const url = getActivityUrl(activity);
        if (url) {
            router.push(url);
        }
    };

    return (
        <Card 
            shadow="sm" 
            padding="md" 
            radius="md" 
            withBorder
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <Group justify="space-between" mb="md">
                <Text 
                    size="lg" 
                    fw={700}
                    style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}
                >
                    Activity Feed
                </Text>
                {!loading && activities.length > 0 && (
                    <Badge size="sm" variant="light" color="gray">
                        {activities.length}
                    </Badge>
                )}
            </Group>

            {loading ? (
                <Box style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: 200 }}>
                    <PurpleLoader size="md" />
                </Box>
            ) : activities.length === 0 ? (
                <Box style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: 200 }}>
                    <Text c="dimmed" size="sm">No recent activity</Text>
                </Box>
            ) : (
                <ScrollArea style={{ flex: 1 }} type="auto">
                    <Stack gap="sm">
                        {activities.map((activity) => {
                            const url = getActivityUrl(activity);
                            const isClickable = url !== null;
                            
                            return (
                                <Card 
                                    key={activity.id} 
                                    padding="sm" 
                                    radius="sm"
                                    style={{ 
                                        backgroundColor: 'var(--mantine-color-gray-0)',
                                        border: '1px solid var(--mantine-color-gray-2)',
                                        cursor: isClickable ? 'pointer' : 'default',
                                        transition: 'all 0.2s ease',
                                    }}
                                    onClick={() => isClickable && handleActivityClick(activity)}
                                    onMouseEnter={(e) => {
                                        if (isClickable) {
                                            e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-1)';
                                            e.currentTarget.style.borderColor = 'var(--mantine-color-gray-3)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (isClickable) {
                                            e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-0)';
                                            e.currentTarget.style.borderColor = 'var(--mantine-color-gray-2)';
                                        }
                                    }}
                                >
                                <Group align="flex-start" gap="sm" wrap="nowrap">
                                    <Box
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 8,
                                            backgroundColor: `var(--mantine-color-${getActivityColor(activity.type)}-1)`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {getActivityIcon(activity.type)}
                                    </Box>
                                    
                                    <Box style={{ flex: 1, minWidth: 0 }}>
                                        <Text size="sm" fw={600} mb={4} lineClamp={1}>
                                            {activity.title}
                                        </Text>
                                        <Text size="xs" c="dimmed" mb={6} lineClamp={2}>
                                            {activity.description}
                                        </Text>
                                        
                                        <Group gap="xs" wrap="nowrap">
                                            {activity.actor && (
                                                <>
                                                    <Avatar 
                                                        size={16} 
                                                        radius="xl"
                                                        src={activity.actor.avatar_url}
                                                        alt={getActorDisplay(activity.actor)}
                                                        color="indigo"
                                                    >
                                                        {!activity.actor.avatar_url && getActorInitials(activity.actor)}
                                                    </Avatar>
                                                    <Text size="xs" c="dimmed" style={{ fontWeight: 500 }}>
                                                        {getActorDisplay(activity.actor)}
                                                    </Text>
                                                    <Text size="xs" c="dimmed">•</Text>
                                                </>
                                            )}
                                            <Text size="xs" c="dimmed">
                                                {formatTimestamp(activity.timestamp)}
                                            </Text>
                                        </Group>
                                    </Box>
                                </Group>
                            </Card>
                        );
                        })}
                    </Stack>
                </ScrollArea>
            )}
        </Card>
    );
}

