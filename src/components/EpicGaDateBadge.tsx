'use client';

import { Tooltip } from '@mantine/core';
import { formatDateOnlyForDisplay, getCohort2DateForTimeline } from '@/lib/date-utils';
import { getEpicGaDateYmd } from '@/lib/epic-rollout-dates';
import type { ReleaseScheduleDateRow } from '@/lib/epic-ga-date';
import type { Epic } from '@/types/epics';

type Props = {
  epic: Pick<Epic, 'scheduled_ga_dev_date' | 'target_launch_date' | 'aha_fields'>;
  releaseSchedule: ReleaseScheduleDateRow[];
  releaseTrainDateYmd?: string | null;
  releaseName?: string | null;
  dateOptions?: Intl.DateTimeFormatOptions;
  emptyLabel?: string;
};

/**
 * GA column on /epics. Shows per-epic GA (Aha scheduled GA → release train → Cohort 1 + 28).
 * When the epic date differs from the release-train GA shown on the timeline, explains the mismatch.
 */
export function EpicGaDateBadge({
  epic,
  releaseSchedule,
  releaseTrainDateYmd,
  releaseName,
  dateOptions,
  emptyLabel = '-',
}: Props) {
  const epicGaYmd = getEpicGaDateYmd(epic, {
    releaseSchedule,
    releaseTrainDateYmd,
  });
  const releaseGaYmd =
    releaseName && releaseTrainDateYmd
      ? getCohort2DateForTimeline(releaseName, releaseTrainDateYmd, releaseSchedule)
      : null;

  if (!epicGaYmd) return <span>{emptyLabel}</span>;

  const text = formatDateOnlyForDisplay(epicGaYmd, dateOptions);
  if (releaseGaYmd && epicGaYmd !== releaseGaYmd) {
    const trainLabel = formatDateOnlyForDisplay(releaseGaYmd, dateOptions);
    return (
      <Tooltip
        label={`Release train GA on the timeline is ${trainLabel}. This row shows the epic's Scheduled GA from Aha!`}
        withArrow
        multiline
        w={280}
      >
        <span>{text}</span>
      </Tooltip>
    );
  }
  return <span>{text}</span>;
}
