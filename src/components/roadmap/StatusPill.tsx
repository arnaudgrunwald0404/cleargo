'use client';

import { Badge, type BadgeProps } from '@mantine/core';
import { getStatusColorInfo } from '@/lib/roadmap/statusColors';

interface StatusPillProps extends Omit<BadgeProps, 'color' | 'children'> {
  status: string | null | undefined;
}

/**
 * Color-coded status badge that classifies any Aha! status string into one
 * of four families (planning / in-progress / released / cancelled). Use
 * everywhere we render `aha_status` in the roadmap UI for consistency.
 */
export function StatusPill({ status, size = 'sm', ...rest }: StatusPillProps) {
  const info = getStatusColorInfo(status);
  if (!status) {
    return (
      <Badge size={size} variant="outline" color="gray" {...rest}>
        —
      </Badge>
    );
  }
  return (
    <Badge
      size={size}
      variant="light"
      color={info.color}
      styles={{
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
      }}
      {...rest}
    >
      {status}
    </Badge>
  );
}
