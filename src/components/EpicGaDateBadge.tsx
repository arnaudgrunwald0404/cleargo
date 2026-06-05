'use client';

import { ReleaseDateCell } from '@/components/ReleaseDateCell';
import { formatDateOnlyForDisplay, getCohort2DateForTimeline } from '@/lib/date-utils';
import type { ReleaseScheduleDateRow } from '@/lib/epic-ga-date';
import type { Epic } from '@/types/epics';
import {
  getRolloutAwareGaYmd,
  getGaCellShading,
  isRolloutGaFromOffSchedule,
} from '@/lib/epic-rollout-process';

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

  const differsFromTrain = !!releaseGaYmd && epicGaYmd !== releaseGaYmd;
  const shading = getGaCellShading(epic, true, epicGaYmd, releaseGaYmd);
  const tooltip = isRolloutGaFromOffSchedule(epic)
    ? 'Off Schedule Release Date — outside the standard release train'
    : differsFromTrain
      ? `Epic GA differs from release train (${formatDateOnlyForDisplay(releaseGaYmd!, dateOptions)})`
      : undefined;

  return (
    <ReleaseDateCell
      ymd={epicGaYmd}
      shading={shading}
      dateOptions={dateOptions}
      emptyLabel={emptyLabel}
      tooltip={tooltip}
    />
  );
}
