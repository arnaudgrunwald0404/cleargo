'use client';

import { Group, Text, Tooltip } from '@mantine/core';

interface InlineProgressBarProps {
  progress: number | null | undefined;
  ahaKey?: string;
  showLabel?: boolean;
  width?: number | string;
}

/**
 * Compact horizontal bar showing an epic's % progress (from
 * `roadmap_snapshot.aha_progress`). Mirrors RRV's inline progress bar
 * under each item title in the snapshot table.
 */
export function InlineProgressBar({
  progress,
  ahaKey,
  showLabel = true,
  width = 120,
}: InlineProgressBarProps) {
  if (progress === undefined || progress === null || progress < 0) return null;
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  const bar = (
    <Group gap={6} wrap="nowrap">
      <div
        style={{
          height: 6,
          width,
          background: 'var(--color-gray-100)',
          borderRadius: 999,
          overflow: 'hidden',
          minWidth: 60,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background:
              'linear-gradient(90deg, var(--color-info-base, #60a5fa), var(--color-info-dark, #2563eb))',
            transition: 'width 0.3s',
          }}
        />
      </div>
      {showLabel && (
        <Text size="xs" fw={500} style={{ color: 'var(--color-gray-600)' }}>
          {pct}%
        </Text>
      )}
    </Group>
  );

  return (
    <Tooltip
      label={ahaKey ? `${ahaKey} · Progress: ${pct}%` : `Progress: ${pct}%`}
      withArrow
      openDelay={300}
    >
      {bar}
    </Tooltip>
  );
}
