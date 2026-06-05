'use client';

import { Tooltip } from '@mantine/core';
import { ReleaseDateCell } from '@/components/ReleaseDateCell';
import { formatDateOnlyForDisplay, getCohort2DateForTimeline } from '@/lib/date-utils';
import type { ReleaseScheduleDateRow } from '@/lib/epic-ga-date';
import type { Epic } from '@/types/epics';
import { getRolloutAwareGaYmd, getGaCellShading } from '@/lib/epic-rollout-process';

type Props = {
  epic: Pick<Epic, 'scheduled_ga_dev_date' | 'target_launch_date' | 'aha_fields'>;
  releaseSchedule: ReleaseScheduleDateRow[];
  releaseTrainDateYmd?: string | null;
  releaseName?: string | null;
  dateOptions?: Intl.DateTimeFormatOptions;
  emptyLabel?: string;
};

/**
 * GA column on /epics. Rollout-aware: Single GA shows off-schedule in GA; Dual Cohort uses standard resolution.
 */
export function EpicGaDateBadge({
  epic,
  releaseSchedule,
  releaseTrainDateYmd,
  releaseName,
  dateOptions,
  emptyLabel = '-',
}: Props) {
  const epicGaYmd = getRolloutAwareGaYmd(epic, {
    releaseSchedule,
    releaseTrainDateYmd,
  });
  const releaseGaYmd =
    releaseName && releaseTrainDateYmd
      ? getCohort2DateForTimeline(releaseName, releaseTrainDateYmd, releaseSchedule)
      : null;

  if (!epicGaYmd) return <span>{emptyLabel}</span>;

  const cell = (
    <ReleaseDateCell
      ymd={epicGaYmd}
      shading={getGaCellShading(epic, true)}
      dateOptions={dateOptions}
      emptyLabel={emptyLabel}
    />
  );

  if (releaseGaYmd && epicGaYmd !== releaseGaYmd) {
    const trainLabel = formatDateOnlyForDisplay(releaseGaYmd, dateOptions);
    return (
      <Tooltip
        label={`Release train GA on the timeline is ${trainLabel}. This row shows the epic's Scheduled GA from Aha!`}
        withArrow
        multiline
        w={280}
      >
        {cell}
      </Tooltip>
    );
  }

  return cell;
}
