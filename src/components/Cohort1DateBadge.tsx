'use client';

import { Tooltip } from '@mantine/core';
import { formatDateOnlyForDisplay } from '@/lib/date-utils';
import type { Epic } from '@/types/epics';
import {
  getEffectiveCohort1DateYmd,
  getEpicCohort1DisplayYmd,
  isCohort1FromOffSchedule,
} from '@/lib/epic-cohort1-date';

type Props = {
  epic: Pick<Epic, 'target_launch_date' | 'off_schedule_release_date'>;
  /**
   * When defined (including null), use detail precedence: off-schedule → schedule row → target launch.
   * When omitted, use list-style: off-schedule → target launch only.
   */
  scheduleReleaseDate?: string | null;
  dateOptions?: Intl.DateTimeFormatOptions;
  emptyLabel?: string;
};

export function Cohort1DateBadge({ epic, scheduleReleaseDate, dateOptions, emptyLabel = '-' }: Props) {
  const ymd =
    scheduleReleaseDate !== undefined
      ? getEpicCohort1DisplayYmd(epic, scheduleReleaseDate)
      : getEffectiveCohort1DateYmd(epic);
  const off = isCohort1FromOffSchedule(epic);
  if (!ymd) return <span>{emptyLabel}</span>;
  const text = formatDateOnlyForDisplay(ymd, dateOptions);
  if (!off) return <span>{text}</span>;
  return (
    <Tooltip label="Scheduled release date" withArrow>
      <span
        style={{
          backgroundColor: '#FEF3C7',
          color: '#92400E',
          padding: '2px 8px',
          borderRadius: 6,
          display: 'inline-block',
        }}
      >
        {text}
      </span>
    </Tooltip>
  );
}
