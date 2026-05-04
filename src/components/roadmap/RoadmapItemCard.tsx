'use client';

import { ActionIcon, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconCalendar, IconEye, IconEyeOff, IconUsers } from '@tabler/icons-react';
import { format } from 'date-fns';
import { ConfidenceBadge } from '@/components/roadmap/ConfidenceBadge';
import { InlineProgressBar } from '@/components/roadmap/InlineProgressBar';
import { StatusPill } from '@/components/roadmap/StatusPill';
import type { RoadmapComparison } from '@/types/roadmap';

interface RoadmapItemCardProps {
  comparison: RoadmapComparison;
  isHidden?: boolean;
  canEdit?: boolean;
  onToggleHidden?: () => void;
  onClick?: () => void;
}

function formatDateOrTbd(date: string | null | undefined): string {
  if (!date) return 'TBD';
  try {
    return format(new Date(date), 'MMM d');
  } catch {
    return 'TBD';
  }
}

/**
 * "Expanded" card view for a single epic in the snapshot — denser
 * RoadmapCard equivalent from RRV. Used when the user toggles
 * Simple → Expanded on the filters bar.
 */
export function RoadmapItemCard({
  comparison,
  isHidden = false,
  canEdit = false,
  onToggleHidden,
  onClick,
}: RoadmapItemCardProps) {
  const { latest, changes } = comparison;
  const timelineFields = ['aha_start_date', 'aha_end_date', 'aha_release'];
  const hasTimelineChange = changes.changedFields.some((f) => timelineFields.includes(f));
  const hasOtherChange = changes.changedFields.some((f) => !timelineFields.includes(f));

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      bg="var(--color-white)"
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        opacity: isHidden ? 0.45 : 1,
        transition: 'opacity 0.15s, box-shadow 0.15s',
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text size="sm" fw={600} lineClamp={2} style={{ color: 'var(--color-gray-900)' }}>
              {latest.aha_name || latest.aha_key}
            </Text>
            <Text size="xs" mt={2} style={{ color: 'var(--color-gray-500)' }}>
              {latest.aha_key}
            </Text>
          </div>
          {canEdit && onToggleHidden && (
            <Tooltip label={isHidden ? 'Unhide' : 'Hide from non-Product users'} withArrow>
              <ActionIcon
                variant="subtle"
                color={isHidden ? 'orange' : 'gray'}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleHidden();
                }}
              >
                {isHidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        <Group gap="xs" wrap="wrap" align="center">
          <StatusPill status={latest.aha_status} />
          <ConfidenceBadge ahaKey={latest.aha_key} ahaName={latest.aha_name || latest.aha_key} />
          {latest.aha_csm_priority && latest.aha_csm_priority.trim() && (
            <Tooltip
              label={`CSM / New Business Priority: ${latest.aha_csm_priority}`}
              withArrow
              openDelay={250}
            >
              <Badge size="xs" variant="filled" color="violet">
                CSM Priority
              </Badge>
            </Tooltip>
          )}
        </Group>

        <InlineProgressBar
          progress={latest.aha_progress}
          ahaKey={latest.aha_key}
          width="100%"
        />

        <Group gap="md" wrap="wrap" mt="xs">
          <Group gap={4} wrap="nowrap">
            <IconCalendar size={12} color="var(--color-gray-500)" />
            <Text size="xs" style={{ color: 'var(--color-gray-700)' }}>
              {formatDateOrTbd(latest.aha_start_date)} → {formatDateOrTbd(latest.aha_end_date)}
            </Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            <IconUsers size={12} color="var(--color-gray-500)" />
            <Text size="xs" style={{ color: 'var(--color-gray-700)' }}>
              {(latest.aha_owner || 'Unassigned').split('@')[0]}
              {latest.aha_pod ? ` · ${latest.aha_pod}` : ''}
            </Text>
          </Group>
        </Group>

        {(changes.isNew || hasTimelineChange || hasOtherChange) && (
          <Group gap={6} wrap="wrap" mt={4}>
            {changes.isNew && (
              <Badge size="xs" variant="light" color="teal">
                NEW
              </Badge>
            )}
            {hasTimelineChange && !changes.isNew && (
              <Badge size="xs" variant="light" color="orange">
                Timeline shifted
              </Badge>
            )}
            {hasOtherChange && !changes.isNew && (
              <Badge size="xs" variant="light" color="blue">
                Details updated
              </Badge>
            )}
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
