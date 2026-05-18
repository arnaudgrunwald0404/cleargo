'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Card, Group, List, Modal, Stack, Text, Textarea, Title } from '@mantine/core';
import type { PeriodShiftAnalysis, PlanVsActualItem } from '@/types/roadmap';
import {
  PlanVsActualNarrativeText,
  buildAhaKeyNameMap,
} from '@/components/analytics/PlanVsActualNarrativeText';

export function ShiftAnalysisPanel({
  analysis,
  generatedAt,
  reportItems = [],
  canGenerate,
  canEditPeriodNarrative,
  generating,
  savingPeriodNarrative,
  autoRunPending,
  generationError,
  reportLoading,
  onGenerate,
  onRegenerate,
  onSavePeriodNarrative,
}: {
  analysis: PeriodShiftAnalysis | null | undefined;
  generatedAt: string | null;
  /** Rows for the active period — used to link Aha keys in overview/themes. */
  reportItems?: PlanVsActualItem[];
  canGenerate: boolean;
  /** Overview + themes editing (requires cached analysis) */
  canEditPeriodNarrative: boolean;
  generating: boolean;
  /** Plan vs actual report query still loading (no data yet for this period) */
  reportLoading?: boolean;
  savingPeriodNarrative?: boolean;
  /** True while automatic first-load generation is in progress */
  autoRunPending?: boolean;
  /** Mutation error from generate/regenerate (API or network) */
  generationError?: string | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  onSavePeriodNarrative: (overview: string, themesLines: string[]) => void | Promise<void>;
}) {
  const [overviewDraft, setOverviewDraft] = useState(() => analysis?.overview ?? '');
  const [themesDraft, setThemesDraft] = useState(() => (analysis?.themes ?? []).join('\n'));

  const themesFromDraft = useMemo(
    () =>
      themesDraft
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    [themesDraft],
  );

  const periodDirty = useMemo(() => {
    if (!analysis) return false;
    const origThemes = analysis.themes ?? [];
    if (overviewDraft.trim() !== (analysis.overview ?? '').trim()) return true;
    if (themesFromDraft.length !== origThemes.length) return true;
    return themesFromDraft.some((t, i) => t !== origThemes[i]);
  }, [analysis, overviewDraft, themesFromDraft]);

  const hasPersistedUserEdits = Boolean(analysis?.modelVersion?.includes('user_edited'));
  const regenNeedsExtraWarning = hasPersistedUserEdits || periodDirty;

  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);

  const ahaNameByKey = useMemo(() => buildAhaKeyNameMap(reportItems), [reportItems]);

  const confirmRegenerate = () => {
    setRegenerateModalOpen(false);
    onRegenerate();
  };

  return (
    <Card withBorder>
      <Modal
        opened={regenerateModalOpen}
        onClose={() => setRegenerateModalOpen(false)}
        title="Regenerate analysis?"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            This replaces the cached AI narrative for this period (period overview, themes, and all line-level
            narratives) with a fresh model run.
          </Text>
          {regenNeedsExtraWarning ? (
            <Alert color="orange" title="Your edits may be lost">
              {hasPersistedUserEdits
                ? 'This period includes saved manual edits to narratives. Regenerating will overwrite those changes.'
                : null}
              {hasPersistedUserEdits && periodDirty ? ' ' : null}
              {periodDirty
                ? 'You also have unsaved changes in the overview or themes fields above — regenerate anyway only if you intend to discard them.'
                : null}
            </Alert>
          ) : null}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setRegenerateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={generating}
              disabled={Boolean(reportLoading)}
              onClick={confirmRegenerate}
            >
              Regenerate
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Stack gap="md">
        <GroupTitleActions
          canGenerate={canGenerate}
          generating={generating || Boolean(autoRunPending)}
          hasAnalysis={Boolean(analysis)}
          reportLoading={Boolean(reportLoading)}
          onGenerate={onGenerate}
          onRequestRegenerate={() => setRegenerateModalOpen(true)}
        />
        {generationError ? (
          <Text size="sm" c="red">
            {generationError}
          </Text>
        ) : null}
        {generatedAt && (
          <Text size="xs" c="dimmed">
            Analysis generated: {new Date(generatedAt).toLocaleString()}
          </Text>
        )}
        {!analysis ? (
          <Text c="dimmed" size="sm">
            {autoRunPending
              ? 'Generating line-level narratives (stored per period). This runs automatically when analysis is missing.'
              : 'Analysis is generated automatically when you open a period (if you have permission), or use the button below. Line-level text appears in the table above.'}
          </Text>
        ) : canEditPeriodNarrative ? (
          <Stack gap="sm">
            <Textarea
              label="Period overview"
              description="High-level narrative for this period."
              minRows={4}
              value={overviewDraft}
              onChange={(e) => setOverviewDraft(e.currentTarget.value)}
              autosize
              maxRows={16}
            />
            <Textarea
              label="Themes"
              description="One theme per line."
              minRows={3}
              value={themesDraft}
              onChange={(e) => setThemesDraft(e.currentTarget.value)}
              autosize
              maxRows={12}
            />
            <div>
              <Button
                loading={Boolean(savingPeriodNarrative)}
                disabled={!periodDirty || Boolean(savingPeriodNarrative)}
                onClick={() => void onSavePeriodNarrative(overviewDraft, themesFromDraft)}
              >
                Save period narrative
              </Button>
            </div>
          </Stack>
        ) : (
          <Stack gap="sm">
            <PlanVsActualNarrativeText text={analysis.overview} nameByKey={ahaNameByKey} />
            {analysis.themes?.length ? (
              <div>
                <Text fw={600} size="sm" mb={4}>
                  Themes
                </Text>
                <List size="sm" spacing="xs">
                  {analysis.themes.map((t) => (
                    <List.Item key={t}>
                      <PlanVsActualNarrativeText text={t} nameByKey={ahaNameByKey} />
                    </List.Item>
                  ))}
                </List>
              </div>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function GroupTitleActions({
  canGenerate,
  generating,
  hasAnalysis,
  reportLoading,
  onGenerate,
  onRequestRegenerate,
}: {
  canGenerate: boolean;
  generating: boolean;
  hasAnalysis: boolean;
  reportLoading: boolean;
  onGenerate: () => void;
  onRequestRegenerate: () => void;
}) {
  return (
    <Stack gap="xs">
      <Title order={3} size="h4">
        AI narrative (plan vs actual)
      </Title>
      <Text c="dimmed" size="sm">
        Generate period overview, themes, and line-level narratives.
      </Text>
      {canGenerate ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!hasAnalysis ? (
            <Button loading={generating} disabled={reportLoading} onClick={onGenerate}>
              Generate analysis
            </Button>
          ) : (
            <Button
              variant="light"
              loading={generating}
              disabled={reportLoading}
              onClick={onRequestRegenerate}
            >
              Regenerate (overwrite cache)
            </Button>
          )}
        </div>
      ) : (
        <Text size="sm" c="dimmed">
          Ask a Product Ops / CPO user to generate analysis if missing.
        </Text>
      )}
    </Stack>
  );
}
