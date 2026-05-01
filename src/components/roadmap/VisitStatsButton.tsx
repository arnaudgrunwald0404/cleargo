'use client';

import { Button, Group, Skeleton, Tooltip } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useSlideout } from './slideout/SlideoutContext';
import { VisitStatsView } from './VisitStatsView';
import { useRoadmapVisitStats, type RoadmapVisitPage } from '@/hooks/useRoadmapVisits';

interface VisitStatsButtonProps {
  snapshotDate: string | null | undefined;
  page: RoadmapVisitPage;
  /** Optional aria-label override; defaults to `View who visited this snapshot`. */
  ariaLabel?: string;
}

/**
 * Compact `[👁 N visits]` button that opens the visit-stats slideout.
 * Hidden while we don't yet have a snapshotDate (avoids a flicker on
 * first paint). Mirrors RRV's `VisitStatsDialog`.
 */
export function VisitStatsButton({ snapshotDate, page, ariaLabel }: VisitStatsButtonProps) {
  const { push } = useSlideout();
  const { data, isLoading } = useRoadmapVisitStats(snapshotDate, page);

  if (!snapshotDate) return null;
  if (isLoading) {
    return <Skeleton height={28} width={96} radius="sm" />;
  }

  const visitors = data ?? [];
  const uniqueCount = visitors.length;
  if (uniqueCount === 0) return null;

  return (
    <Tooltip label="See who has viewed this snapshot" withArrow openDelay={300}>
      <Button
        variant="subtle"
        color="violet"
        size="xs"
        onClick={() =>
          push({
            id: `visit-stats-${page}-${snapshotDate}`,
            title: 'Visit statistics',
            description: `Who has viewed the ${snapshotDate} ${page === 'snapshot' ? 'Snapshot' : 'Rewind'}`,
            render: () => <VisitStatsView snapshotDate={snapshotDate} page={page} />,
          })
        }
        aria-label={ariaLabel ?? 'View who visited this snapshot'}
      >
        <Group gap={4} wrap="nowrap">
          <IconEye size={14} />
          <span>
            {uniqueCount} visitor{uniqueCount === 1 ? '' : 's'}
          </span>
        </Group>
      </Button>
    </Tooltip>
  );
}
