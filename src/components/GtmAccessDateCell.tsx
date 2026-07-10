'use client';

import { useState } from 'react';
import { Button, Checkbox, Popover, UnstyledButton, Tooltip } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { IconCheck } from '@tabler/icons-react';
import { formatDateOnlyForDisplay } from '@/lib/date-utils';
import type { Epic } from '@/types/epics';

export type GtmAccessDatePatch = {
  actual_gtm_access_date?: string | null;
  gtm_access_confirmed?: boolean;
  gtm_access_na?: boolean;
};

type Props = {
  epic: Pick<
    Epic,
    'id' | 'actual_gtm_access_date' | 'gtm_access_confirmed' | 'gtm_access_na'
  >;
  plannedYmd: string | null;
  dateOptions?: Intl.DateTimeFormatOptions;
  editable?: boolean;
  needsAttention?: boolean;
  onUpdate: (patch: GtmAccessDatePatch) => void | Promise<void>;
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
  const isNa = epic.gtm_access_na === true;
  const actualYmd = epic.actual_gtm_access_date ?? null;
  const confirmed = epic.gtm_access_confirmed === true;

  const handleDateChange = async (value: string | null) => {
    if (!editable || !value) return;
    await onUpdate({
      actual_gtm_access_date: value,
      gtm_access_na: false,
    });
    setPickerOpen(false);
  };

  const handleMarkNa = async () => {
    if (!editable) return;
    await onUpdate({
      gtm_access_na: true,
      actual_gtm_access_date: null,
      gtm_access_confirmed: false,
    });
    setPickerOpen(false);
  };

  const handleConfirmToggle = async () => {
    if (!editable) return;
    await onUpdate({ gtm_access_confirmed: !confirmed });
  };

  const displayYmd = !isNa ? (actualYmd ?? plannedYmd) : null;
  const displayText = isNa
    ? 'N/A'
    : displayYmd
      ? formatDateOnlyForDisplay(displayYmd, dateOptions)
      : null;
  const showingPlannedOnly = !isNa && !actualYmd && !!plannedYmd;
  const isOverridden = !isNa && !!actualYmd && !!plannedYmd && actualYmd !== plannedYmd;

  const dateTooltip = isNa
    ? 'GTM orgs access marked not applicable'
    : isOverridden
      ? `Actual GTM orgs enabled date (differs from planned ${formatDateOnlyForDisplay(plannedYmd!, dateOptions)})`
      : actualYmd
        ? 'Actual GTM orgs enabled date'
        : plannedYmd
          ? 'Planned GTM orgs enabled date from release train'
          : editable
            ? 'Click to set GTM orgs enabled date or N/A'
            : undefined;

  const doneControl = editable ? (
    <Tooltip
      label={
        confirmed
          ? 'Undo GTM orgs enabled confirmation'
          : isNa
            ? 'Confirm GTM orgs N/A'
            : 'Confirm GTM orgs are enabled'
      }
      withArrow
    >
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
        color: isNa || showingPlannedOnly ? '#6B7280' : '#111827',
        fontStyle: isOverridden || isNa || showingPlannedOnly ? 'italic' : 'normal',
        fontWeight: isOverridden ? 600 : showingPlannedOnly || isNa ? 400 : 500,
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
    if (!displayText && !confirmed) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 70 }}>-</span>;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 70 }}>
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
          <DatePicker value={isNa ? null : actualYmd} onChange={handleDateChange} size="sm" />
          <Button
            variant={isNa ? 'filled' : 'light'}
            color="gray"
            size="compact-xs"
            fullWidth
            mt="xs"
            onClick={handleMarkNa}
          >
            N/A — not applicable
          </Button>
        </Popover.Dropdown>
      </Popover>
      {doneControl}
    </span>
  );
}
