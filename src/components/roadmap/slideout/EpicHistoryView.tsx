'use client';

import { useMemo, useState } from 'react';
import {
  Anchor,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowRight,
  IconCalendar,
  IconClock,
  IconExternalLink,
  IconNote,
  IconPencilPlus,
  IconUsers,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { useEpicSnapshotHistory, type EpicSnapshotVersion } from '@/hooks/useEpicSnapshotHistory';
import { useEpicComments } from '@/hooks/useEpicComments';
import { canEditRoadmap, useCurrentUser } from '@/hooks/useCurrentUser';
import { ConfidenceBadge } from '@/components/roadmap/ConfidenceBadge';
import { AddEpicNoteForm } from '@/components/roadmap/slideout/AddEpicNoteForm';
import { isExternalCause, type PmNoteCause } from '@/lib/roadmap/pmNoteCause';
import type { RoadmapComparison, RoadmapItem } from '@/types/roadmap';

interface EpicHistoryViewProps {
  ahaKey: string;
  comparison?: RoadmapComparison;
  /** Cached Claude blurb for this epic at the viewed snapshot (Performance Insights). */
  aiSummary?: string | null;
}

interface ReleaseMovementEvent {
  type: 'movement';
  date: string;
  fromRelease: string | null;
  toRelease: string | null;
}

interface NoteEvent {
  type: 'note';
  date: string;
  text: string;
  authorEmail: string | null;
  movementCause: PmNoteCause;
  category: 'general' | 'movement' | 'risk' | 'decision' | null;
}

type TimelineEvent = ReleaseMovementEvent | NoteEvent;

const FIELD_LABELS: Record<string, string> = {
  aha_start_date: 'Start Date',
  aha_end_date: 'End Date',
  aha_release: 'Release',
  aha_status: 'Status',
  aha_owner: 'Contact',
  aha_pod: 'Pod',
  aha_t_shirt_est: 'T-shirt Size',
};

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  try {
    return format(new Date(value), 'MMM d, yyyy');
  } catch {
    return value;
  }
}

function formatValue(value: unknown, fieldKey: string): string {
  if (value == null || value === '') return 'Not set';
  if (fieldKey === 'aha_start_date' || fieldKey === 'aha_end_date') {
    return formatDate(String(value));
  }
  if (fieldKey === 'aha_owner') {
    return String(value).split('@')[0] || String(value);
  }
  return String(value);
}

function extractReleaseMovements(history: EpicSnapshotVersion[]): ReleaseMovementEvent[] {
  if (history.length === 0) return [];
  const sorted = [...history].sort((a, b) => a.version_number - b.version_number);
  const events: ReleaseMovementEvent[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const previous = i > 0 ? sorted[i - 1] : null;
    if (previous && current.aha_release === previous.aha_release) continue;
    events.push({
      type: 'movement',
      date: current.snapshot_date,
      fromRelease: previous?.aha_release ?? null,
      toRelease: current.aha_release ?? null,
    });
  }
  return events;
}

export function EpicHistoryView({ ahaKey, comparison, aiSummary }: EpicHistoryViewProps) {
  const { data: history = [], isLoading: historyLoading } = useEpicSnapshotHistory(ahaKey);
  const { data: comments = [], isLoading: commentsLoading } = useEpicComments(ahaKey);
  const { data: me } = useCurrentUser();
  const canEdit = canEditRoadmap(me?.roles);
  /** Open form keyed by `null` (general note) or `${date}` for movement notes. */
  const [openForm, setOpenForm] = useState<string | null | undefined>(undefined);

  const movements = useMemo(() => extractReleaseMovements(history), [history]);

  const timeline: TimelineEvent[] = useMemo(() => {
    const events: TimelineEvent[] = [
      ...movements,
      ...comments.map<NoteEvent>((c) => ({
        type: 'note',
        date: c.movement_date ?? c.created_at,
        text: c.comment_text,
        authorEmail: c.author_email,
        movementCause: c.movement_cause,
        category: c.category,
      })),
    ];
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movements, comments]);

  const current: RoadmapItem | null = comparison?.latest ?? null;
  const ahaUrl = current?.aha_key ? `https://clearco.aha.io/epics/${current.aha_key}` : null;
  const jiraUrl = current?.jira_key
    ? `https://clearco.atlassian.net/browse/${current.jira_key}`
    : null;

  const isLoading = historyLoading || commentsLoading;

  return (
    <Stack gap="lg">
      {/* Current state card */}
      {current && (
        <Paper withBorder bg="var(--color-white)" p="md">
          <Group justify="space-between" align="flex-start" mb="xs" wrap="wrap">
            <Group gap="sm" wrap="wrap">
              {ahaUrl && (
                <Anchor
                  href={ahaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xs"
                  c="copper.6"
                >
                  <Group gap={4} wrap="nowrap">
                    {current.aha_key}
                    <IconExternalLink size={12} />
                  </Group>
                </Anchor>
              )}
              {jiraUrl && (
                <Anchor
                  href={jiraUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xs"
                  c="blue.7"
                >
                  <Group gap={4} wrap="nowrap">
                    {current.jira_key}
                    <IconExternalLink size={12} />
                  </Group>
                </Anchor>
              )}
              <ConfidenceBadge ahaKey={ahaKey} ahaName={current?.aha_name || ahaKey} />
            </Group>
            {current.aha_csm_priority && (
              <Badge size="sm" variant="filled" color="violet">
                {current.aha_csm_priority}
              </Badge>
            )}
          </Group>

          <SimpleGrid cols={2} spacing="xs">
            <FieldTile label="Status" value={current.aha_status || '—'} />
            <FieldTile label="Release" value={current.aha_release || '—'} />
            {(current.aha_start_date || current.aha_end_date) && (
              <>
                <FieldTile label="Start" value={formatDate(current.aha_start_date)} accent="blue" />
                <FieldTile label="End" value={formatDate(current.aha_end_date)} accent="blue" />
              </>
            )}
            {(current.aha_owner || current.aha_pod) && (
              <>
                {current.aha_owner && (
                  <FieldTile
                    label="Contact"
                    value={current.aha_owner.split('@')[0] || current.aha_owner}
                    accent="purple"
                    icon={<IconUsers size={12} />}
                  />
                )}
                {current.aha_pod && (
                  <FieldTile label="Pod" value={current.aha_pod} accent="purple" />
                )}
              </>
            )}
          </SimpleGrid>
          {aiSummary ? (
            <Text
              size="sm"
              mt="sm"
              style={{ fontStyle: 'italic', color: 'var(--mantine-color-dimmed)' }}
            >
              {aiSummary}
            </Text>
          ) : null}
        </Paper>
      )}

      {/* What changed in the latest snapshot */}
      {comparison && comparison.changes.changedFields.length > 0 && comparison.previous && (
        <Paper withBorder bg="var(--color-cast-iron-bg)" p="md">
          <Group gap={6} mb="xs">
            <IconAlertCircle size={16} color="var(--color-warning-dark)" />
            <Text fw={600} size="sm" style={{ color: 'var(--color-gray-900)' }}>
              What changed in the latest snapshot
            </Text>
          </Group>
          <Stack gap="xs">
            {comparison.changes.changedFields.map((field) => {
              const prev = formatValue(
                comparison.previous?.[field as keyof RoadmapItem],
                field,
              );
              const next = formatValue(comparison.latest[field as keyof RoadmapItem], field);
              return (
                <Paper key={field} withBorder bg="var(--color-white)" p="xs">
                  <Text size="xs" fw={500} mb={4} style={{ color: 'var(--color-gray-900)' }}>
                    {FIELD_LABELS[field] ?? field}
                  </Text>
                  <Group gap={6} wrap="wrap" align="center">
                    <Text
                      size="xs"
                      td="line-through"
                      style={{ color: 'var(--color-error-base)' }}
                    >
                      {prev}
                    </Text>
                    <IconArrowRight size={12} color="var(--color-gray-500)" />
                    <Badge
                      size="sm"
                      variant="light"
                      color="green"
                      styles={{ root: { textTransform: 'none', fontWeight: 600 } }}
                    >
                      {next}
                    </Badge>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* Timeline */}
      <div>
        <Group justify="space-between" mb="xs" wrap="wrap">
          <Group gap={6}>
            <IconClock size={16} color="var(--color-gray-700)" />
            <Text fw={600} size="sm" style={{ color: 'var(--color-gray-900)' }}>
              History &amp; notes
            </Text>
          </Group>
          {canEdit && (
            <Button
              size="xs"
              variant="light"
              color="violet"
              leftSection={<IconPencilPlus size={12} />}
              onClick={() => setOpenForm((cur) => (cur === null ? undefined : null))}
            >
              {openForm === null ? 'Cancel' : 'Add note'}
            </Button>
          )}
        </Group>
        {openForm === null && (
          <Box mb="xs">
            <AddEpicNoteForm
              ahaKey={ahaKey}
              onCreated={() => setOpenForm(undefined)}
              onCancel={() => setOpenForm(undefined)}
            />
          </Box>
        )}

        {isLoading && timeline.length === 0 ? (
          <Group py="md" justify="center">
            <Loader size="sm" />
          </Group>
        ) : timeline.length === 0 ? (
          <Text size="sm" ta="center" py="md" style={{ color: 'var(--color-gray-500)' }}>
            No release movements or notes recorded yet.
          </Text>
        ) : (
          <div className="rrv-epic-history-timeline">
            {timeline.map((event, idx) => (
              <div
                className="rrv-epic-history-row"
                key={`${event.type}-${idx}-${event.date}`}
              >
                <span className="rrv-epic-history-bullet">
                  {event.type === 'movement' ? (
                    <IconCalendar size={10} />
                  ) : (
                    <IconNote size={10} />
                  )}
                </span>
                <Text size="xs" style={{ color: 'var(--color-gray-600)' }}>
                  {format(new Date(event.date), 'MMM d, yyyy')}
                </Text>
                {event.type === 'movement' ? (
                  <>
                    <Group gap={6} mt={2} wrap="wrap" align="center">
                      {event.fromRelease == null ? (
                        <>
                          <Badge size="xs" variant="light" color="teal">
                            NEW
                          </Badge>
                          <Text size="sm" style={{ color: 'var(--color-gray-800)' }}>
                            Created in {event.toRelease ?? '—'}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Badge size="xs" variant="outline" color="gray">
                            {event.fromRelease}
                          </Badge>
                          <IconArrowRight size={12} color="var(--color-gray-500)" />
                          <Badge size="xs" variant="outline" color="violet">
                            {event.toRelease ?? '—'}
                          </Badge>
                        </>
                      )}
                      {canEdit && (
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="violet"
                          ml="auto"
                          onClick={() =>
                            setOpenForm((cur) => (cur === event.date ? undefined : event.date))
                          }
                        >
                          {openForm === event.date ? 'Cancel' : 'Add note'}
                        </Button>
                      )}
                    </Group>
                    {openForm === event.date && (
                      <Box mt={6}>
                        <AddEpicNoteForm
                          ahaKey={ahaKey}
                          movementDate={event.date}
                          fromRelease={event.fromRelease}
                          toRelease={event.toRelease}
                          onCreated={() => setOpenForm(undefined)}
                          onCancel={() => setOpenForm(undefined)}
                        />
                      </Box>
                    )}
                  </>
                ) : (
                  <Paper withBorder bg="var(--color-white)" p="xs" mt={4}>
                    <Group gap={6} mb={4} wrap="wrap">
                      <IconNote size={12} color="var(--color-gray-600)" />
                      <Text fw={500} size="xs" style={{ color: 'var(--color-gray-900)' }}>
                        {event.authorEmail?.split('@')[0] ?? 'Unknown'}
                      </Text>
                      {event.movementCause && (
                        <Badge
                          size="xs"
                          variant="light"
                          color={isExternalCause(event.movementCause) ? 'red' : 'blue'}
                          styles={{ root: { textTransform: 'none', maxWidth: 280 } }}
                        >
                          {event.movementCause}
                        </Badge>
                      )}
                      {event.category && event.category !== 'movement' && (
                        <Badge size="xs" variant="outline" color="gray">
                          {event.category}
                        </Badge>
                      )}
                    </Group>
                    <Text size="sm" style={{ color: 'var(--color-gray-800)' }}>
                      {event.text}
                    </Text>
                  </Paper>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Divider />
      <Text size="xs" ta="center" style={{ color: 'var(--color-gray-500)' }}>
        Showing {history.length} weekly snapshots since the first ingest.
      </Text>
    </Stack>
  );
}

interface FieldTileProps {
  label: string;
  value: string;
  accent?: 'blue' | 'purple' | 'amber';
  icon?: React.ReactNode;
}

function FieldTile({ label, value, accent, icon }: FieldTileProps) {
  const bg =
    accent === 'blue'
      ? 'var(--color-blue-50)'
      : accent === 'purple'
        ? '#F5F3FF'
        : accent === 'amber'
          ? 'var(--color-warning-light)'
          : 'var(--color-cast-iron-bg)';
  const labelColor =
    accent === 'blue'
      ? 'var(--color-info-dark)'
      : accent === 'purple'
        ? '#5B21B6'
        : accent === 'amber'
          ? 'var(--color-warning-dark)'
          : 'var(--color-gray-700)';
  const valueColor =
    accent === 'blue'
      ? 'var(--color-info-dark)'
      : accent === 'purple'
        ? '#4C1D95'
        : accent === 'amber'
          ? 'var(--color-warning-dark)'
          : 'var(--color-gray-900)';
  return (
    <Box style={{ background: bg, borderRadius: 6, padding: '6px 8px' }}>
      <Group gap={4} wrap="nowrap">
        {icon}
        <Text
          size="xs"
          tt="uppercase"
          fw={500}
          style={{ color: labelColor, fontSize: 10, letterSpacing: 0.5 }}
        >
          {label}
        </Text>
      </Group>
      <Text size="xs" fw={500} mt={2} style={{ color: valueColor }} truncate>
        {value}
      </Text>
    </Box>
  );
}
