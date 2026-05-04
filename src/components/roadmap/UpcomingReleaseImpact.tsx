'use client';

import { useMemo } from 'react';
import { Badge, Box, Card, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconArrowRight,
  IconSparkles,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { InlineProgressBar } from '@/components/roadmap/InlineProgressBar';
import type { PeriodReleaseMovement } from '@/types/roadmap';

/**
 * Top-of-page summary panel for the Roadmap Snapshot view: shows the
 * release movements (this week's snapshot vs. the previous one) that
 * affect the next-3 upcoming releases, grouped by impacted release and
 * split into Accelerated / Delayed / New buckets.
 *
 * This is the ClearGo port of RRV's `UpcomingReleaseImpact` (in
 * `c:/Repos/roadmap-insights/src/components/UpcomingReleaseImpact.tsx`).
 * Inputs are the same shape RRV uses — `PeriodReleaseMovement[]` from
 * `usePeriodReleaseMovements()` plus the next-3-releases list from
 * `useRoadmapData().allReleases` — so the component is a pure
 * presentational layer; no new RPCs or hooks are required.
 */

type MovementDirection = 'accelerated' | 'delayed' | 'new';

function parseRelease(rel: string): { major: number; minor: number } {
  const match = rel.match(/(\d+)(?:\.(\d+))?/);
  if (!match) return { major: 0, minor: 0 };
  return {
    major: parseInt(match[1], 10),
    minor: match[2] ? parseInt(match[2], 10) : 0,
  };
}

function getMovementDirection(m: PeriodReleaseMovement): MovementDirection {
  // No previous release → newly assigned to an upcoming release.
  if (!m.from_release) return 'new';
  // Had a previous release but no current one → epic left the report
  // window (Aha! moved it to a release no longer in the pivot, e.g. far
  // out, parking lot, or unscheduled). Semantically that's "deferred /
  // pushed back" — `get_year_movements_with_impact`'s
  // `movements_out_of_window` CTE explicitly returns these rows with
  // `to_release = NULL`. Match RRV by classifying them as Delayed.
  if (!m.to_release) return 'delayed';
  const from = parseRelease(m.from_release);
  const to = parseRelease(m.to_release);
  const fromValue = from.major * 1000 + from.minor;
  const toValue = to.major * 1000 + to.minor;
  if (toValue < fromValue) return 'accelerated';
  if (toValue > fromValue) return 'delayed';
  return 'new';
}

interface MovementWithProgress extends PeriodReleaseMovement {
  /** Optional progress, looked up from the snapshot's comparison set. */
  aha_progress?: number | null;
}

export interface UpcomingReleaseImpactProps {
  /** The week's release movements (already filtered to a single snapshot week). */
  movements: MovementWithProgress[];
  /** Next-3 upcoming releases by date, e.g. ["2026.5", "2026.6", "2026.7"]. */
  upcomingReleases: string[];
  /** Click handler — the parent typically opens an EpicHistoryView slideout. */
  onItemClick: (ahaKey: string) => void;
  /** Snapshot date used in the description (`Apr 28`). */
  snapshotDate?: string | null;
  /** When true, the panel renders for a *historical* snapshot (changes wording). */
  isHistoricalMode?: boolean;
}

const DIRECTION_META: Record<
  MovementDirection,
  { label: string; sublabel: string; color: string; icon: typeof IconTrendingUp }
> = {
  accelerated: {
    label: 'Accelerated',
    sublabel: 'moved up',
    color: 'green',
    icon: IconTrendingUp,
  },
  delayed: {
    label: 'Delayed',
    sublabel: 'pushed back',
    color: 'orange',
    icon: IconTrendingDown,
  },
  new: {
    label: 'New to Release',
    sublabel: 'newly assigned',
    color: 'blue',
    icon: IconSparkles,
  },
};

const IMPACT_COLOR: Record<NonNullable<PeriodReleaseMovement['impact_level']>, string> = {
  high: 'red',
  positive: 'teal',
  medium: 'yellow',
  low: 'gray',
};

export function UpcomingReleaseImpact({
  movements,
  upcomingReleases,
  onItemClick,
  snapshotDate,
  isHistoricalMode = false,
}: UpcomingReleaseImpactProps) {
  const upcomingSet = useMemo(() => new Set(upcomingReleases), [upcomingReleases]);

  const groupedByRelease = useMemo(() => {
    const groups = new Map<
      string,
      { accelerated: MovementWithProgress[]; delayed: MovementWithProgress[]; new: MovementWithProgress[] }
    >();

    movements.forEach((m) => {
      // Skip movements that don't touch any upcoming release.
      const touchesUpcoming =
        (m.to_release && upcomingSet.has(m.to_release)) ||
        (m.from_release && upcomingSet.has(m.from_release));
      if (!touchesUpcoming) return;

      // The "impacted release" is the earlier of the two — that's the
      // release whose plan is changing right now (anything moving INTO
      // it accelerates it, anything moving OUT of it delays it).
      let impactedRelease = m.to_release ?? m.from_release ?? '';
      if (m.from_release && m.to_release) {
        const from = parseRelease(m.from_release);
        const to = parseRelease(m.to_release);
        const fromValue = from.major * 1000 + from.minor;
        const toValue = to.major * 1000 + to.minor;
        impactedRelease = fromValue < toValue ? m.from_release : m.to_release;
      }
      if (!upcomingSet.has(impactedRelease)) return;

      const direction = getMovementDirection(m);
      if (!groups.has(impactedRelease)) {
        groups.set(impactedRelease, { accelerated: [], delayed: [], new: [] });
      }
      groups.get(impactedRelease)![direction].push(m);
    });

    // Preserve the input order (already date-sorted by parent).
    return upcomingReleases
      .filter((r) => groups.has(r))
      .map((release) => {
        const g = groups.get(release)!;
        return {
          release,
          accelerated: g.accelerated,
          delayed: g.delayed,
          newItems: g.new,
          totalCount: g.accelerated.length + g.delayed.length + g.new.length,
        };
      });
  }, [movements, upcomingReleases, upcomingSet]);

  const totalAccelerated = groupedByRelease.reduce((s, g) => s + g.accelerated.length, 0);
  const totalDelayed = groupedByRelease.reduce((s, g) => s + g.delayed.length, 0);

  const periodDescription = useMemo(() => {
    if (!snapshotDate) return isHistoricalMode ? 'this snapshot' : "this week's snapshot";
    try {
      const d = new Date(`${snapshotDate}T12:00:00Z`);
      return isHistoricalMode
        ? `the snapshot taken on ${format(d, 'MMM d, yyyy')}`
        : `this week (${format(d, 'MMM d')})`;
    } catch {
      return isHistoricalMode ? 'this snapshot' : "this week's snapshot";
    }
  }, [snapshotDate, isHistoricalMode]);

  // Friendly label for movements that left the report window (i.e. epic
  // had a release in the previous snapshot but `to_release` is NULL in
  // the latest one). The "+" hedges because the RPC can't tell us *how
  // many* releases out it actually went — only that it's outside the
  // visible next-N window.
  const outOfWindowLabel = `Moved ${upcomingReleases.length}+ releases out`;

  if (groupedByRelease.length === 0) return null;

  return (
    <Card withBorder radius="md" p="md" bg="var(--color-white)">
      <Group justify="space-between" align="center" wrap="wrap" mb="xs">
        <Text fw={600} size="md" style={{ color: 'var(--color-gray-900)' }}>
          Release Movements Impacting Upcoming Releases
        </Text>
        <Group gap="xs">
          {totalAccelerated > 0 && (
            <Badge variant="light" color="green" leftSection={<IconTrendingUp size={12} />}>
              {totalAccelerated} accelerated
            </Badge>
          )}
          {totalDelayed > 0 && (
            <Badge variant="light" color="orange" leftSection={<IconTrendingDown size={12} />}>
              {totalDelayed} delayed
            </Badge>
          )}
        </Group>
      </Group>

      <Text size="xs" mb="md" style={{ color: 'var(--color-gray-600)' }}>
        Showing {periodDescription} movements into or out of the next {upcomingReleases.length}{' '}
        release{upcomingReleases.length === 1 ? '' : 's'}.
      </Text>

      <Stack gap="lg">
        {groupedByRelease.map((g) => (
          <Stack key={g.release} gap="sm">
            <Group gap="xs" align="center">
              <Badge variant="filled" color="violet" size="md">
                {g.release}
              </Badge>
              <Text size="xs" style={{ color: 'var(--color-gray-600)' }}>
                {g.totalCount} movement{g.totalCount === 1 ? '' : 's'}
              </Text>
            </Group>

            <DirectionGroup
              direction="accelerated"
              items={g.accelerated}
              onItemClick={onItemClick}
              outOfWindowLabel={outOfWindowLabel}
            />
            <DirectionGroup
              direction="delayed"
              items={g.delayed}
              onItemClick={onItemClick}
              outOfWindowLabel={outOfWindowLabel}
            />
            <DirectionGroup
              direction="new"
              items={g.newItems}
              onItemClick={onItemClick}
              outOfWindowLabel={outOfWindowLabel}
            />
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}

interface DirectionGroupProps {
  direction: MovementDirection;
  items: MovementWithProgress[];
  onItemClick: (ahaKey: string) => void;
  outOfWindowLabel: string;
}

function DirectionGroup({ direction, items, onItemClick, outOfWindowLabel }: DirectionGroupProps) {
  if (items.length === 0) return null;
  const meta = DIRECTION_META[direction];
  const Icon = meta.icon;
  return (
    <Stack gap={6} pl="sm">
      <Group gap="xs" align="center">
        <ThemeIcon variant="light" color={meta.color} size="sm" radius="sm">
          <Icon size={14} />
        </ThemeIcon>
        <Text size="sm" fw={500} style={{ color: `var(--mantine-color-${meta.color}-7)` }}>
          {meta.label}
        </Text>
        <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
          ({items.length} item{items.length === 1 ? '' : 's'} {meta.sublabel})
        </Text>
      </Group>
      <Box pl="md" style={{ borderLeft: `2px solid var(--mantine-color-${meta.color}-2)` }}>
        <Stack gap={6}>
          {items.map((m, i) => (
            <MovementRow
              key={`${m.aha_key}-${i}`}
              movement={m}
              direction={direction}
              onClick={() => onItemClick(m.aha_key)}
              outOfWindowLabel={outOfWindowLabel}
            />
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

interface MovementRowProps {
  movement: MovementWithProgress;
  direction: MovementDirection;
  outOfWindowLabel: string;
  onClick: () => void;
}

function MovementRow({ movement, direction, onClick, outOfWindowLabel }: MovementRowProps) {
  const meta = DIRECTION_META[direction];
  const impactColor = movement.impact_level ? IMPACT_COLOR[movement.impact_level] : null;

  return (
    <Paper
      withBorder
      p="sm"
      radius="sm"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        cursor: 'pointer',
        background: 'var(--color-white)',
        borderLeft: `3px solid var(--mantine-color-${meta.color}-5)`,
        transition: 'background 120ms ease-in-out',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--color-gray-50)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--color-white)';
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text
            size="sm"
            fw={500}
            lineClamp={1}
            style={{ color: 'var(--color-gray-900)' }}
            title={movement.aha_name}
          >
            {movement.aha_name || movement.aha_key}
          </Text>
          <Group gap="xs" align="center">
            <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
              {movement.aha_key}
            </Text>
            {impactColor && (
              <Badge
                size="xs"
                variant="light"
                color={impactColor}
                styles={{ root: { textTransform: 'capitalize' } }}
              >
                {movement.impact_level} impact
                {movement.is_overridden ? ' (override)' : ''}
              </Badge>
            )}
          </Group>
          <InlineProgressBar progress={movement.aha_progress ?? null} ahaKey={movement.aha_key} />
        </Stack>
        <Group gap={6} wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
          {movement.from_release ? (
            <>
              <Badge variant="outline" color="gray" size="sm" radius="sm">
                {movement.from_release}
              </Badge>
              <IconArrowRight size={12} color="var(--color-gray-500)" />
            </>
          ) : null}
          {movement.to_release ? (
            <Badge variant="light" color={meta.color} size="sm" radius="sm">
              {movement.to_release}
            </Badge>
          ) : (
            <Badge
              variant="light"
              color="red"
              size="sm"
              radius="sm"
              title="The epic was moved to a release no longer in the next-N visible window (parking lot, far-out, or unscheduled in Aha!)."
            >
              {outOfWindowLabel}
            </Badge>
          )}
        </Group>
      </Group>
    </Paper>
  );
}

export { getMovementDirection };
