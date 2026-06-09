'use client';

import { useState } from 'react';
import { Checkbox, Popover, UnstyledButton, Tooltip } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { IconCheck } from '@tabler/icons-react';
import { formatDateOnlyForDisplay } from '@/lib/date-utils';
import type { Epic } from '@/types/epics';

type Props = {
  epic: Pick<Epic, 'id' | 'actual_gtm_access_date' | 'gtm_access_confirmed'>;
  plannedYmd: string | null;
  dateOptions?: Intl.DateTimeFormatOptions;
  editable?: boolean;
  needsAttention?: boolean;
  onUpdate: (patch: {
    actual_gtm_access_date?: string | null;
    gtm_access_confirmed?: boolean;
  }) => void | Promise<void>;
};

export function GtmAccessDateCell({
  epic,
  plannedYmd,
  dateOptions = { month: 'short', day: 'numeric' },
  editable = false,
  needsAttention = false,
  onUpdate,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const actualYmd = epic.actual_gtm_access_date ?? null;
  const confirmed = epic.gtm_access_confirmed === true;

  const handleDateChange = async (value: string | null) => {
    if (!editable) return;
    await onUpdate({ actual_gtm_access_date: value });
    setPickerOpen(false);
  };

  const handleConfirmToggle = async () => {
    if (!editable) return;
    await onUpdate({ gtm_access_confirmed: !confirmed });
  };

  const displayYmd = actualYmd ?? plannedYmd;
  const displayText = displayYmd
    ? formatDateOnlyForDisplay(displayYmd, dateOptions)
    : null;
  const showingPlannedOnly = !actualYmd && !!plannedYmd;
  const isOverridden = !!actualYmd && !!plannedYmd && actualYmd !== plannedYmd;

  const dateTooltip = isOverridden
    ? `Actual GTM orgs enabled date (differs from planned ${formatDateOnlyForDisplay(plannedYmd!, dateOptions)})`
    : actualYmd
      ? 'Actual GTM orgs enabled date'
      : plannedYmd
        ? 'Planned GTM orgs enabled date from release train'
        : editable
          ? 'Click to set GTM orgs enabled date'
          : undefined;

  const doneControl = editable ? (
    <Tooltip label={confirmed ? 'Undo GTM orgs enabled confirmation' : 'Confirm GTM orgs are enabled'} withArrow>
      <Checkbox
        checked={confirmed}
        onChange={handleConfirmToggle}
        onClick={(e) => e.stopPropagation()}
        size="md"
        color={confirmed ? 'green' : needsAttention ? 'orange' : 'gray'}
        aria-label={confirmed ? 'Undo GTM orgs enabled confirmation' : 'Confirm GTM orgs are enabled'}
        styles={{
          root: { display: 'inline-flex', alignItems: 'center' },
          input: { cursor: 'pointer' },
        }}
      />
    </Tooltip>
  ) : confirmed ? (
    <IconCheck size={16} style={{ color: '#16A34A', flexShrink: 0 }} aria-label="GTM orgs enabled confirmed" />
  ) : null;

  const dateSpan = (
    <span
      style={{
        fontSize: '14px',
        color: showingPlannedOnly ? '#6B7280' : '#111827',
        fontStyle: isOverridden || showingPlannedOnly ? 'italic' : 'normal',
        fontWeight: isOverridden ? 600 : showingPlannedOnly ? 400 : 500,
        cursor: editable ? 'pointer' : 'default',
      }}
    >
      {displayText ?? '-'}
      {isOverridden ? (
        <sup aria-hidden style={{ marginLeft: 1, fontSize: '0.75em' }}>
          *
        </sup>
      ) : null}
    </span>
  );

  const dateContent =
    dateTooltip ? (
      <Tooltip label={dateTooltip} withArrow multiline w={280}>
        {dateSpan}
      </Tooltip>
    ) : (
      dateSpan
    );

  if (!editable) {
    if (!displayText && !confirmed) return <span>-</span>;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {displayText ? dateContent : null}
        {doneControl}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, lineHeight: 1.3 }}>
      <Popover
        opened={pickerOpen}
        onChange={setPickerOpen}
        position="bottom-start"
        withArrow
        shadow="md"
        withinPortal
        width="auto"
      >
        <Popover.Target>
          <UnstyledButton
            onClick={() => setPickerOpen((o) => !o)}
            style={{ padding: 0, lineHeight: 1.3, height: 'auto' }}
            aria-label="Set actual GTM access date"
          >
            {dateContent}
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown p="xs">
          <DatePicker value={actualYmd} onChange={handleDateChange} size="sm" />
        </Popover.Dropdown>
      </Popover>
      {doneControl}
    </span>
  );
}
