'use client';

import { ActionIcon, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
/** PM movement cause — shown beside status when the row status warrants a “why” hint. */
export function PlanVsActualPmCauseHint({
  pmNoteCause,
  statusLabel,
}: {
  pmNoteCause: string | null | undefined;
  statusLabel: string;
}) {
  const full = pmNoteCause?.trim();
  const title = full
    ? `${statusLabel} · PM reason: ${full}`
    : `No PM movement reason recorded for ${statusLabel}`;

  return (
    <Tooltip label={title} withArrow multiline maw={320} position="top">
      <ActionIcon
        variant="subtle"
        color={full ? 'blue' : 'gray'}
        size="sm"
        aria-label={full ? `PM reason: ${full}` : 'No PM reason recorded'}
        onClick={(e) => e.stopPropagation()}
      >
        <IconInfoCircle size={16} stroke={1.5} />
      </ActionIcon>
    </Tooltip>
  );
}
