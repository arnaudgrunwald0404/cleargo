'use client';

import { useEffect, useState } from 'react';
import { Card, Text, Stack, Group, Avatar, Badge, ScrollArea, Box, Loader } from '@mantine/core';
import { IconBolt, IconFolderCheck, IconCalendar, IconMessage } from '@tabler/icons-react';
import { ActivityFeedItem } from '@/app/api/activity-feed/route';

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      const res = await fetch('/api/activity-feed?limit=15');
      if (!res.ok) throw new Error('Failed to fetch activities');
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

  return (
    <Card
      shadow="sm"
      padding="md"
      radius="md"
      withBorder
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Group justify="space-between" mb="md">
        <Text size="lg" fw={700} style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}>
          Activity Feed
        </Text>
        {!loading && activities.length > 0 && (
          <Badge size="sm" variant="light" color="gray">
            {activities.length}
          </Badge>
        )}
      </Group>

      {loading ? (
        <Box
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flex: 1,
            minHeight: 200,
          }}
        >
          <Loader size="md" />
        </Box>
      ) : activities.length === 0 ? (
        <Box
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flex: 1,
            minHeight: 200,
          }}
        >
          <Text c="dimmed" size="sm">
            No recent activity
          </Text>
        </Box>
      ) : (
        <ScrollArea style={{ flex: 1 }} type="auto">
          <Stack gap="sm">
            {activities.map((activity) => (
              <Card
                key={activity.id}
                padding="sm"
                radius="sm"
                style={{
                  backgroundColor: 'var(--mantine-color-gray-0)',
                  border: '1px solid var(--mantine-color-gray-2)',
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
                          <Text size="xs" c="dimmed">
                            •
                          </Text>
                        </>
                      )}
                      <Text size="xs" c="dimmed">
                        {formatTimestamp(activity.timestamp)}
                      </Text>
                    </Group>
                  </Box>
                </Group>
              </Card>
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Card>
  );
}
