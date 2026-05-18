'use client';

import { useState } from 'react';
import { Anchor, Box, Button, Divider, Group, Stack, Text, Textarea } from '@mantine/core';
import { IconExternalLink, IconPencil, IconRefresh } from '@tabler/icons-react';
import type { PlanVsActualItem } from '@/types/roadmap';
import { ahaEpicUrl } from '@/lib/aha/epicUrl';
import { internalExternalLabel } from '@/lib/roadmap/planVsActualTableHelpers';
import { formatPlanVsActualReleaseLabel } from '@/lib/roadmap/planVsActualStatus';
import {
  PlanVsActualNarrativeText,
  buildAhaKeyNameMap,
} from '@/components/analytics/PlanVsActualNarrativeText';
import { StatusIndicator } from './StatusIndicator';

export type PlanVsActualRowInsight = {
  summary: string;
  likelyReasons: string;
  arrImpact?: string;
};

const metaGrid = {
  display: 'grid',
  gridTemplateColumns: 'minmax(9.5rem, 34%) 1fr',
  columnGap: 'var(--mantine-spacing-md)',
  rowGap: 'var(--mantine-spacing-sm)',
  alignItems: 'start' as const,
  margin: 0,
};

function DetailLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text component="dt" size="xs" c="dimmed" fw={500} lh={1.45} style={{ paddingTop: 2 }}>
      {children}
    </Text>
  );
}

function DetailValue({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <Box
      component="dd"
      m={0}
      c={muted ? 'dimmed' : undefined}
      style={{
        minWidth: 0,
        fontSize: 'var(--mantine-font-size-sm)',
        lineHeight: 1.55,
      }}
    >
      {children}
    </Box>
  );
}

export function PlanVsActualItemDetail({
  row,
  insight,
  canEditShift,
  onSave,
  onRegenerateItemNarrative,
  rowSaving,
  rowRegenerating,
  getArrImpact,
}: {
  row: PlanVsActualItem;
  insight?: PlanVsActualRowInsight;
  canEditShift?: boolean;
  onSave: (args: {
    ahaKey: string;
    summary: string;
    likelyReasons: string;
    arrImpact?: string;
  }) => void | Promise<void>;
  onRegenerateItemNarrative?: () => void | Promise<void>;
  rowSaving?: boolean;
  rowRegenerating?: boolean;
  getArrImpact: () => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draftSummary, setDraftSummary] = useState('');
  const [draftLikely, setDraftLikely] = useState('');

  const beginEdit = () => {
    setDraftSummary(insight?.summary ?? '');
    setDraftLikely(insight?.likelyReasons ?? '');
    setEditing(true);
  };

  const pmReasonDisplay = (() => {
    const full = row.pmNoteCause?.trim();
    if (!full) return '—';
    const ie = internalExternalLabel(row.pmNoteCause);
    return ie + (full !== ie ? ` · ${full}` : '');
  })();

  const ahaUrl = ahaEpicUrl(row.ahaKey);
  const endReleaseLabel = formatPlanVsActualReleaseLabel(row.endRelease ?? row.startRelease);

  return (
    <Stack gap="lg">
      <Box component="dl" style={metaGrid}>
        <DetailLabel>Aha epic</DetailLabel>
        <DetailValue>
          <Anchor href={ahaUrl} target="_blank" rel="noopener noreferrer" size="sm" fw={500}>
            {row.ahaKey}
            <IconExternalLink size={14} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
          </Anchor>
        </DetailValue>

        <DetailLabel>Status (end of period)</DetailLabel>
        <DetailValue>
          <Group gap="xs" wrap="wrap">
            <StatusIndicator category={row.statusCategory} label={row.statusLabel} />
            {endReleaseLabel ? (
              <Text size="sm" c="dimmed">
                Release {endReleaseLabel}
              </Text>
            ) : null}
          </Group>
        </DetailValue>

        <DetailLabel>PM reason (latest)</DetailLabel>
        <DetailValue>{pmReasonDisplay}</DetailValue>

        <DetailLabel>Releases</DetailLabel>
        <DetailValue>
          {`Start: ${row.startRelease ?? '—'} → End: ${row.endRelease ?? '—'}`}
        </DetailValue>

        <DetailLabel>Snapshot coverage</DetailLabel>
        <DetailValue>
          <Stack gap={6} style={{ minWidth: 0 }}>
            <Text size="sm" lh={1.55}>
              In start period: {row.inStart ? 'Yes' : 'No'} · In end period: {row.inEnd ? 'Yes' : 'No'}
            </Text>
            <Text size="sm" c="dimmed" lh={1.55}>
              Compared: {row.startSnapshotDate ?? '—'} → {row.endSnapshotDate ?? '—'}
            </Text>
          </Stack>
        </DetailValue>

        {(row.startProgress != null || row.endProgress != null) && (
          <>
            <DetailLabel>Progress (Aha)</DetailLabel>
            <DetailValue>
              {`${row.startProgress ?? '—'}% → ${row.endProgress ?? '—'}%`}
            </DetailValue>
          </>
        )}
      </Box>

      <Divider />

      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
          <Text size="xs" c="dimmed" fw={500} lh={1.45} style={{ paddingTop: 2 }}>
            Narrative
          </Text>
          {canEditShift && !editing ? (
            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconPencil size={14} />}
                disabled={Boolean(rowRegenerating)}
                onClick={beginEdit}
              >
                {insight ? 'Edit' : 'Add'}
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconRefresh size={14} />}
                loading={rowRegenerating}
                disabled={Boolean(rowSaving) || Boolean(rowRegenerating)}
                onClick={() => void onRegenerateItemNarrative?.()}
              >
                Regenerate
              </Button>
            </Group>
          ) : null}
        </Group>

        {editing ? (
          <Stack gap="sm">
            <Textarea
              label="Summary"
              size="sm"
              minRows={2}
              value={draftSummary}
              onChange={(e) => setDraftSummary(e.currentTarget.value)}
              autosize
              maxRows={10}
            />
            <Textarea
              label="Supporting detail"
              description="Facts from snapshots and PM notes only"
              size="sm"
              minRows={2}
              value={draftLikely}
              onChange={(e) => setDraftLikely(e.currentTarget.value)}
              autosize
              maxRows={12}
            />
            <Group gap="xs">
              <Button
                size="sm"
                loading={rowSaving}
                disabled={rowSaving}
                onClick={async () => {
                  try {
                    await onSave({
                      ahaKey: row.ahaKey,
                      summary: draftSummary,
                      likelyReasons: draftLikely,
                      arrImpact: getArrImpact().trim(),
                    });
                    setEditing(false);
                  } catch {
                    /* parent shows error */
                  }
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="default" disabled={rowSaving} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </Group>
          </Stack>
        ) : insight ? (
          <Stack gap="sm">
            <PlanVsActualNarrativeText
              text={insight.summary}
              nameByKey={buildAhaKeyNameMap([{ ahaKey: row.ahaKey, featureName: row.featureName }])}
            />
            <PlanVsActualNarrativeText
              text={insight.likelyReasons}
              nameByKey={buildAhaKeyNameMap([{ ahaKey: row.ahaKey, featureName: row.featureName }])}
            />
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" lh={1.6}>
            Generate period analysis to add narratives, or use Edit when analysis exists.
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
