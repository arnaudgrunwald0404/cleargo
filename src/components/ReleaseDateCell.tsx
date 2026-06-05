'use client';

import { Tooltip } from '@mantine/core';
import { formatDateOnlyForDisplay } from '@/lib/date-utils';
import type { ReleaseDateShading } from '@/lib/epic-rollout-process';

const SHADING_STYLES: Record<
  Exclude<ReleaseDateShading, 'none'>,
  { backgroundColor: string; color: string; padding: string; borderRadius: number; display: string }
> = {
  orange: {
    backgroundColor: '#FED7AA',
    color: '#9A3412',
    padding: '2px 8px',
    borderRadius: 6,
    display: 'inline-block',
  },
  blue: {
    backgroundColor: '#BFDBFE',
    color: '#1E40AF',
    padding: '2px 8px',
    borderRadius: 6,
    display: 'inline-block',
  },
  'off-schedule': {
    backgroundColor: '#FDE047',
    color: '#713F12',
    padding: '2px 8px',
    borderRadius: 6,
    display: 'inline-block',
  },
};

type Props = {
  ymd: string | null;
  shading?: ReleaseDateShading;
  dateOptions?: Intl.DateTimeFormatOptions;
  emptyLabel?: string;
  fromReleaseTrain?: boolean;
  tooltip?: string;
};

export function ReleaseDateCell({
  ymd,
  shading = 'none',
  dateOptions,
  emptyLabel = '-',
  fromReleaseTrain = false,
  tooltip,
}: Props) {
  if (!ymd) return <span>{emptyLabel}</span>;

  const text = formatDateOnlyForDisplay(ymd, dateOptions);

  if (fromReleaseTrain) {
    return (
      <Tooltip label="Planned Cohort 1 from release train (no PM date on epic)" withArrow>
        <span style={{ color: '#6B7280', fontStyle: 'italic' }}>{text}</span>
      </Tooltip>
    );
  }

  const pillStyle = shading !== 'none' ? SHADING_STYLES[shading] : undefined;
  const defaultTooltip =
    shading === 'off-schedule'
      ? 'Off Schedule Release Date'
      : shading === 'orange'
        ? 'Dual Cohort — Cohort 1 date'
        : shading === 'blue'
          ? 'General Availability date'
          : undefined;
  const tip = tooltip ?? defaultTooltip;

  if (pillStyle) {
    const pill = <span style={pillStyle}>{text}</span>;
    return tip ? (
      <Tooltip label={tip} withArrow>
        {pill}
      </Tooltip>
    ) : (
      pill
    );
  }

  if (tip) {
    return (
      <Tooltip label={tip} withArrow multiline w={280}>
        <span>{text}</span>
      </Tooltip>
    );
  }

  return <span>{text}</span>;
}
