'use client';

import { Badge } from '@mantine/core';
import type { PlanVsActualStatusCategory } from '@/types/roadmap';

const COLOR: Record<PlanVsActualStatusCategory, string> = {
  green: 'green',
  yellow: 'yellow',
  red: 'red',
  neutral: 'gray',
};

export function StatusIndicator({
  category,
  label,
}: {
  category: PlanVsActualStatusCategory;
  label: string;
}) {
  return (
    <Badge color={COLOR[category]} variant="light" size="sm" style={{ whiteSpace: 'normal', height: 'auto' }}>
      {label}
    </Badge>
  );
}
