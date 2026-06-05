'use client';

import { useState } from 'react';
import { Button, Checkbox, Popover, UnstyledButton, Tooltip } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { IconCheck } from '@tabler/icons-react';
import { formatDateOnlyForDisplay } from '@/lib/date-utils';
import type { Epic } from '@/types/epics';

export type InternalReadinessDatePatch = {
  actual_internal_readiness_date?: string | null;
  internal_readiness_confirmed?: boolean;
  internal_readiness_na?: boolean;
};

type Props = {
  epic: Pick<
    Epic,
    | 'id'
    | 'actual_internal_readiness_date'
    | 'internal_readiness_confirmed'
    | 'internal_readiness_na'
  >;
  plannedYmd: string | null;
  dateOptions?: Intl.DateTimeFormatOptions;
  editable?: boolean;
  needsAttention?: boolean;
  onUpdate: (patch: InternalReadinessDatePatch) => void | Promise<void>;
};

export function InternalReadinessDateCell({
  epic,
  plannedYmd,
  dateOptions = { month: 'short', day: 'numeric' },
  editable = false,
  needsAttention = false,
  onUpdate,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isNa = epic.internal_readiness_na === true;
  const actualYmd = epic.actual_internal_readiness_date ?? null;
  const confirmed = epic.internal_readiness_confirmed === true;

  const handleDateChange = async (value: string | null) => {
    if (!editable || !value) return;
    await onUpdate({
      actual_internal_readiness_date: value,
      internal_readiness_na: false,
    });
    setPickerOpen(false);
  };

  const handleMarkNa = async () => {
    if (!editable) return;
    await onUpdate({
      internal_readiness_na: true,
      actual_internal_readiness_date: null,
      internal_readiness_confirmed: false,
    });
    setPickerOpen(false);
  };

  const handleConfirmToggle = async () => {
    if (!editable) return;
    await onUpdate({ internal_readiness_confirmed: !confirmed });
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
    ? 'Internal Readiness marked not applicable'
    : isOverridden
      ? `Actual Internal Readiness date (differs from planned ${formatDateOnlyForDisplay(plannedYmd!, dateOptions)})`
      : actualYmd
        ? 'Actual Internal Readiness date'
        : plannedYmd
          ? 'Planned Internal Readiness date from release train'
          : editable
            ? 'Click to set Internal Readiness date or N/A'
            : undefined;

  const doneControl = editable ? (
    <Tooltip
      label={
        confirmed
          ? 'Undo Internal Readiness done'
          : isNa
            ? 'Confirm Internal Readiness N/A'
            : 'Mark Internal Readiness done'
      }
      withArrow
    >
      <Checkbox
        checked={confirmed}
        onChange={handleConfirmToggle}
        onClick={(e) => e.stopPropagation()}
        size="md"
        color={confirmed ? 'green' : needsAttention ? 'orange' : 'gray'}
        aria-label={
          confirmed ? 'Undo Internal Readiness done' : 'Mark Internal Readiness done'
        }
        styles={{
          root: { display: 'inline-flex', alignItems: 'center' },
          input: { cursor: 'pointer' },
        }}
      />
    </Tooltip>
  ) : confirmed ? (
    <IconCheck size={16} style={{ color: '#16A34A', flexShrink: 0 }} aria-label="Internal Readiness confirmed" />
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
            aria-label="Set Internal Readiness date"
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
