'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Progress,
  Slider,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { IconInfoCircle, IconRefresh, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';
import { useAdjustConfidenceRating, type ConfidenceRatingRow } from '@/hooks/useConfidenceRating';

interface ConfidenceAdjustmentDialogProps {
  opened: boolean;
  onClose: () => void;
  rating: ConfidenceRatingRow;
  ahaName: string;
  currentEmail: string | null;
}

const LEVEL_LABEL: Record<string, string> = {
  very_low: 'Very low',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  very_high: 'Very high',
};

const LEVEL_COLOR: Record<string, string> = {
  very_low: 'red',
  low: 'orange',
  medium: 'yellow',
  high: 'teal',
  very_high: 'green',
};

function percentageToLevel(pct: number): string {
  if (pct <= 25) return 'very_low';
  if (pct <= 45) return 'low';
  if (pct <= 65) return 'medium';
  if (pct <= 85) return 'high';
  return 'very_high';
}

export function ConfidenceAdjustmentDialog(props: ConfidenceAdjustmentDialogProps) {
  // Only mount the dialog body when it's open so each open = fresh state
  // (avoids a useEffect-driven reset, which trips react-hooks/set-state-in-effect).
  if (!props.opened) return null;
  return <ConfidenceAdjustmentDialogBody {...props} />;
}

function ConfidenceAdjustmentDialogBody({
  opened,
  onClose,
  rating,
  ahaName,
  currentEmail,
}: ConfidenceAdjustmentDialogProps) {
  const [adjustment, setAdjustment] = useState<number>(rating.pm_adjustment ?? 0);
  const [note, setNote] = useState<string>('');
  const adjust = useAdjustConfidenceRating(currentEmail);

  const previewPct = Math.max(
    0,
    Math.min(100, (rating.calculated_percentage ?? 0) + adjustment),
  );
  const previewLevel = percentageToLevel(previewPct);
  const calculatedLevel = rating.calculated_confidence;

  const handleSave = async () => {
    await adjust.mutateAsync({
      ahaKey: rating.aha_key,
      snapshotDate: rating.snapshot_date,
      newAdjustment: adjustment,
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Stack gap={2}>
          <Text fw={600} size="md" style={{ color: 'var(--color-gray-900)' }}>
            Adjust confidence — {ahaName}
          </Text>
          <Text size="xs" style={{ color: 'var(--color-gray-600)' }}>
            Snapshot {rating.snapshot_date}
          </Text>
        </Stack>
      }
      size="md"
      centered
      zIndex={400}
    >
      <Stack gap="md">
        {/* Auto-calculated */}
        <Paper withBorder p="sm" bg="var(--color-cast-iron-bg)">
          <Group justify="space-between" align="center" mb="xs">
            <Text size="sm" fw={500} style={{ color: 'var(--color-gray-900)' }}>
              Auto-calculated confidence
            </Text>
            <Badge size="sm" variant="light" color={LEVEL_COLOR[calculatedLevel] ?? 'gray'}>
              {LEVEL_LABEL[calculatedLevel] ?? calculatedLevel} ·{' '}
              {Math.round(rating.calculated_percentage)}%
            </Badge>
          </Group>
          <Progress
            value={rating.calculated_percentage}
            color={LEVEL_COLOR[calculatedLevel] ?? 'gray'}
            radius="sm"
          />
          <Text size="xs" mt={6} style={{ color: 'var(--color-gray-600)' }}>
            Based on progress, timeline, status, and historical patterns.
          </Text>
        </Paper>

        {/* Slider */}
        <div>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={500} style={{ color: 'var(--color-gray-900)' }}>
              Your adjustment
            </Text>
            <Badge size="sm" variant="outline" color="violet">
              {adjustment === 0
                ? 'No adjustment'
                : adjustment > 0
                  ? `+${adjustment}% (more optimistic)`
                  : `${adjustment}% (more conservative)`}
            </Badge>
          </Group>
          <Slider
            value={adjustment}
            onChange={setAdjustment}
            min={-20}
            max={20}
            step={5}
            marks={[
              { value: -20, label: '-20' },
              { value: 0, label: '0' },
              { value: 20, label: '+20' },
            ]}
            color="violet"
          />
          <Group gap="xs" mt="md" justify="center">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconTrendingDown size={12} />}
              onClick={() => setAdjustment((v) => Math.max(-20, v - 5))}
              disabled={adjustment <= -20}
            >
              -5%
            </Button>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={12} />}
              onClick={() => setAdjustment(0)}
              disabled={adjustment === 0}
            >
              Reset
            </Button>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconTrendingUp size={12} />}
              onClick={() => setAdjustment((v) => Math.min(20, v + 5))}
              disabled={adjustment >= 20}
            >
              +5%
            </Button>
          </Group>
        </div>

        {/* Preview */}
        <Paper withBorder p="sm" bg="var(--color-white)">
          <Group justify="space-between" align="center" mb="xs">
            <Text size="sm" fw={500} style={{ color: 'var(--color-gray-900)' }}>
              Final confidence (preview)
            </Text>
            <Badge size="sm" variant="filled" color={LEVEL_COLOR[previewLevel] ?? 'gray'}>
              {LEVEL_LABEL[previewLevel] ?? previewLevel} · {Math.round(previewPct)}%
            </Badge>
          </Group>
          <Progress
            value={previewPct}
            color={LEVEL_COLOR[previewLevel] ?? 'gray'}
            radius="sm"
            transitionDuration={300}
          />
          {adjustment !== 0 && (
            <Text size="xs" mt={6} style={{ color: 'var(--color-gray-600)' }}>
              {Math.round(rating.calculated_percentage)}%{' '}
              {adjustment > 0 ? '+' : ''}
              {adjustment}% = {Math.round(previewPct)}%
            </Text>
          )}
        </Paper>

        <Alert
          color="blue"
          variant="light"
          icon={<IconInfoCircle size={16} />}
          styles={{ message: { color: 'var(--color-info-dark)' } }}
        >
          Your adjustment is a persistent offset. The cron job will recalculate the auto-baseline
          weekly, but your adjustment will continue to apply on top.
        </Alert>

        <Textarea
          label="Note (optional)"
          placeholder="Why are you adjusting the confidence?"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={5}
        />

        {adjust.isError && (
          <Alert color="red" variant="light">
            {adjust.error instanceof Error ? adjust.error.message : 'Failed to save adjustment.'}
          </Alert>
        )}

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button
            color="violet"
            onClick={handleSave}
            loading={adjust.isPending}
            disabled={adjustment === (rating.pm_adjustment ?? 0)}
          >
            Save adjustment
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
