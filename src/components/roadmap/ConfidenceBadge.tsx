'use client';

import { useState } from 'react';
import { Badge, Tooltip, UnstyledButton } from '@mantine/core';
import { useConfidenceRating } from '@/hooks/useConfidenceRating';
import { canEditRoadmap, useCurrentUser } from '@/hooks/useCurrentUser';
import { ConfidenceAdjustmentDialog } from './ConfidenceAdjustmentDialog';

const LEVEL_COLOR: Record<string, string> = {
  very_low: 'red',
  low: 'orange',
  medium: 'yellow',
  high: 'teal',
  very_high: 'green',
};

const LEVEL_LABEL: Record<string, string> = {
  very_low: 'Very low',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  very_high: 'Very high',
};

interface ConfidenceBadgeProps {
  ahaKey: string;
  /** Compact rendering (no percentage shown). */
  compact?: boolean;
  /** Optional epic name for the adjustment dialog header. */
  ahaName?: string;
}

/**
 * Read-only badge that shows the latest cron-calculated confidence for an
 * epic. PM/PRODUCT_OPS/CPO/SUPERADMIN users can click to open the
 * `ConfidenceAdjustmentDialog`; everyone else sees a tooltip-only badge.
 */
export function ConfidenceBadge({ ahaKey, compact = false, ahaName }: ConfidenceBadgeProps) {
  const { data, isLoading } = useConfidenceRating(ahaKey);
  const { data: me } = useCurrentUser();
  const [opened, setOpened] = useState(false);

  if (isLoading || !data || data.length === 0) return null;
  const latest = data[0];
  const color = LEVEL_COLOR[latest.final_confidence] ?? 'gray';
  const tooltip = `${LEVEL_LABEL[latest.final_confidence] ?? latest.final_confidence} · ${Math.round(
    latest.final_percentage,
  )}% (calc ${Math.round(latest.calculated_percentage)}%${
    latest.pm_adjustment ? `, PM ${latest.pm_adjustment > 0 ? '+' : ''}${latest.pm_adjustment}` : ''
  }) · ${latest.snapshot_date}`;

  const canEdit = canEditRoadmap(me?.roles);
  const label = compact
    ? LEVEL_LABEL[latest.final_confidence] ?? latest.final_confidence
    : `${LEVEL_LABEL[latest.final_confidence] ?? latest.final_confidence} · ${Math.round(latest.final_percentage)}%`;

  const badge = (
    <Badge
      size="xs"
      variant="light"
      color={color}
      styles={{ root: { cursor: canEdit ? 'pointer' : 'default' } }}
    >
      {label}
    </Badge>
  );

  return (
    <>
      <Tooltip label={canEdit ? `${tooltip} · Click to adjust` : tooltip} withArrow openDelay={300}>
        {canEdit ? (
          <UnstyledButton
            onClick={(e) => {
              e.stopPropagation();
              setOpened(true);
            }}
          >
            {badge}
          </UnstyledButton>
        ) : (
          badge
        )}
      </Tooltip>
      {canEdit && (
        <ConfidenceAdjustmentDialog
          opened={opened}
          onClose={() => setOpened(false)}
          rating={latest}
          ahaName={ahaName ?? ahaKey}
          currentEmail={me?.email ?? null}
        />
      )}
    </>
  );
}
