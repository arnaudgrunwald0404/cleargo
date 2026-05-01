'use client';

import { Badge, Group, Skeleton, Stack, Text } from '@mantine/core';
import { IconBuildingCommunity, IconUsers } from '@tabler/icons-react';
import { format } from 'date-fns';
import {
  formatVisitorName,
  pickPrimaryRole,
  useRoadmapVisitStats,
  type RoadmapVisitPage,
  type RoadmapVisitorRow,
} from '@/hooks/useRoadmapVisits';

interface VisitStatsViewProps {
  snapshotDate: string | null | undefined;
  page: RoadmapVisitPage;
}

/**
 * Slideout body that shows visit totals for a specific roadmap snapshot,
 * grouped by primary role with a recent-visitors list. Mirrors RRV's
 * `VisitStatsView`, swapping IP/department for ClearGo's authenticated
 * user identity and roles.
 */
export function VisitStatsView({ snapshotDate, page }: VisitStatsViewProps) {
  const { data: visits, isLoading, isError } = useRoadmapVisitStats(snapshotDate, page);

  if (isLoading) {
    return (
      <Stack gap="sm">
        {[1, 2, 3].map((i) => (
          <Group key={i} justify="space-between">
            <Skeleton height={14} width={120} />
            <Skeleton height={20} width={28} />
          </Group>
        ))}
      </Stack>
    );
  }

  if (isError) {
    return (
      <Text size="sm" style={{ color: 'var(--color-red-600)' }}>
        Could not load visit stats. Try refreshing.
      </Text>
    );
  }

  const rows = visits ?? [];
  const totalUniqueVisitors = rows.length;
  const totalVisits = rows.reduce((sum, r) => sum + (r.visit_count ?? 1), 0);

  if (totalUniqueVisitors === 0) {
    return (
      <Stack align="center" gap="xs" py="lg" style={{ color: 'var(--color-gray-500)' }}>
        <IconUsers size={28} stroke={1.5} />
        <Text size="sm" style={{ color: 'var(--color-gray-500)' }}>
          No visits recorded for this snapshot yet.
        </Text>
      </Stack>
    );
  }

  // Group by primary role, sort each bucket by most-recent visit.
  const byRole = new Map<string, RoadmapVisitorRow[]>();
  for (const v of rows) {
    const role = pickPrimaryRole(v.app_user?.roles);
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(v);
  }
  for (const list of byRole.values()) {
    list.sort((a, b) => b.last_visited_at.localeCompare(a.last_visited_at));
  }
  const roleBuckets = Array.from(byRole.entries())
    .map(([role, visitors]) => ({ role, visitors, count: visitors.length }))
    .sort((a, b) => b.count - a.count);

  // Recent-visitors strip: 5 most recent across all roles.
  const recent = [...rows]
    .sort((a, b) => b.last_visited_at.localeCompare(a.last_visited_at))
    .slice(0, 5);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Text fw={600} size="lg" style={{ color: 'var(--color-gray-900)' }}>
            {totalUniqueVisitors} unique visitor{totalUniqueVisitors === 1 ? '' : 's'}
          </Text>
          <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
            {totalVisits} total visit{totalVisits === 1 ? '' : 's'} across {roleBuckets.length}{' '}
            role{roleBuckets.length === 1 ? '' : 's'}
          </Text>
        </Stack>
      </Group>

      <Stack gap="xs">
        <Text size="xs" fw={600} tt="uppercase" style={{ color: 'var(--color-gray-500)' }}>
          By role
        </Text>
        {roleBuckets.map((b) => (
          <RoleRow key={b.role} role={b.role} visitors={b.visitors} />
        ))}
      </Stack>

      <Stack gap="xs">
        <Text size="xs" fw={600} tt="uppercase" style={{ color: 'var(--color-gray-500)' }}>
          Recently
        </Text>
        {recent.map((v) => (
          <Group key={v.id} justify="space-between" wrap="nowrap" gap="sm">
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="sm" truncate style={{ color: 'var(--color-gray-900)' }}>
                {formatVisitorName(v)}
              </Text>
              <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
                {pickPrimaryRole(v.app_user?.roles)}
              </Text>
            </Stack>
            <Text size="xs" style={{ color: 'var(--color-gray-500)' }} ta="right">
              {format(new Date(v.last_visited_at), 'MMM d, h:mm a')}
            </Text>
          </Group>
        ))}
      </Stack>
    </Stack>
  );
}

function RoleRow({ role, visitors }: { role: string; visitors: RoadmapVisitorRow[] }) {
  const names = visitors
    .slice(0, 3)
    .map((v) => formatVisitorName(v))
    .join(', ');
  const overflow = visitors.length - 3;
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      gap="sm"
      p="xs"
      style={{
        border: '1px solid var(--color-gray-200)',
        borderRadius: 6,
        background: 'var(--color-white)',
      }}
    >
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
        <IconBuildingCommunity size={14} style={{ color: 'var(--color-gray-500)' }} />
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text size="sm" fw={500} style={{ color: 'var(--color-gray-900)' }}>
            {role}
          </Text>
          <Text size="xs" truncate style={{ color: 'var(--color-gray-500)' }}>
            {names}
            {overflow > 0 ? ` +${overflow} more` : ''}
          </Text>
        </Stack>
      </Group>
      <Badge variant="light" color="violet" size="sm">
        {visitors.length}
      </Badge>
    </Group>
  );
}
