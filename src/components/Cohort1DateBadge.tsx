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
  const pmYmd = getEffectiveCohort1DateYmd(epic);
  const ymd =
    scheduleReleaseDate !== undefined
      ? getEpicCohort1DisplayYmd(epic, scheduleReleaseDate)
      : pmYmd;
  const off = isCohort1FromOffSchedule(epic);
  const fromReleaseTrain =
    scheduleReleaseDate !== undefined && !pmYmd && !off && !!ymd && !!scheduleReleaseDate;
  if (!ymd) return <span>{emptyLabel}</span>;
  const text = formatDateOnlyForDisplay(ymd, dateOptions);
  if (fromReleaseTrain) {
    return (
      <Tooltip label="Planned Cohort 1 from release train (no PM date on epic)" withArrow>
        <span style={{ color: '#6B7280', fontStyle: 'italic' }}>{text}</span>
      </Tooltip>
    );
  }
  if (!off) return <span>{text}</span>;
  return (
    <Tooltip label="Off Schedule Release Date" withArrow>
      <span
        style={{
          backgroundColor: '#FDE047',
          color: '#713F12',
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
