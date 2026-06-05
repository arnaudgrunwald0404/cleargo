'use client';

import { ReleaseDateCell } from '@/components/ReleaseDateCell';
import type { Epic } from '@/types/epics';
import { getEffectiveCohort1DateYmd } from '@/lib/epic-cohort1-date';
import {
  getRolloutAwareCohort1Ymd,
  getCohort1CellShading,
  isRolloutCohort1FromOffSchedule,
  shouldShowCohort1Column,
} from '@/lib/epic-rollout-process';

type Props = {
  epic: Pick<Epic, 'target_launch_date' | 'aha_fields'>;
  /**
   * When defined (including null), use detail precedence: off-schedule → schedule row → target launch.
   * When omitted, use list-style: off-schedule → target launch only.
   */
  scheduleReleaseDate?: string | null;
  dateOptions?: Intl.DateTimeFormatOptions;
  emptyLabel?: string;
};

export function Cohort1DateBadge({ epic, scheduleReleaseDate, dateOptions, emptyLabel = '-' }: Props) {
  if (!shouldShowCohort1Column(epic)) {
    return <span>{emptyLabel}</span>;
  }

  const pmYmd = getEffectiveCohort1DateYmd(epic);
  const ymd =
    scheduleReleaseDate !== undefined
      ? getRolloutAwareCohort1Ymd(epic, scheduleReleaseDate)
      : getRolloutAwareCohort1Ymd(epic);
  const off = isRolloutCohort1FromOffSchedule(epic);
  const fromReleaseTrain =
    scheduleReleaseDate !== undefined && !pmYmd && !off && !!ymd && !!scheduleReleaseDate;

  const shading = getCohort1CellShading(epic, !!ymd, scheduleReleaseDate);
  const tooltip =
    off
      ? 'Off Schedule Release Date'
      : shading === 'off-schedule'
        ? 'Cohort 1 date differs from the release train'
        : undefined;

  return (
    <ReleaseDateCell
      ymd={ymd}
      shading={shading}
      dateOptions={dateOptions}
      emptyLabel={emptyLabel}
      fromReleaseTrain={fromReleaseTrain}
      tooltip={tooltip}
    />
  );
}
