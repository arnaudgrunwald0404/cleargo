'use client';

import { Tooltip } from '@mantine/core';
import { formatDateOnlyForDisplay } from '@/lib/date-utils';
import type { ReleaseDateShading } from '@/lib/epic-rollout-process';

const OFF_SCHEDULE_STYLE = {
  backgroundColor: '#FDE047',
  color: '#713F12',
  padding: '2px 8px',
  borderRadius: 6,
  display: 'inline-block',
} as const;

const ALTERNATE_STYLE = {
  fontWeight: 600,
  fontStyle: 'italic',
  display: 'inline-block',
} as const;

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

  const defaultTooltip =
    shading === 'off-schedule'
      ? 'Off Schedule Release Date — outside the standard release train'
      : shading === 'alternate'
        ? 'Epic date differs from the release train planned date'
        : undefined;
  const tip = tooltip ?? defaultTooltip;

  const content =
    shading === 'off-schedule' ? (
      <span style={OFF_SCHEDULE_STYLE}>{text}</span>
    ) : shading === 'alternate' ? (
      <span style={ALTERNATE_STYLE}>
        {text}
        <sup aria-hidden style={{ marginLeft: 1, fontSize: '0.75em' }}>
          *
        </sup>
      </span>
    ) : (
      <span>{text}</span>
    );

  if (tip) {
    return (
      <Tooltip label={tip} withArrow multiline w={280}>
        {content}
      </Tooltip>
    );
  }

  return content;
}
