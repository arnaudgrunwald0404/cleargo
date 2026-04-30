'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconCalendar,
  IconEye,
  IconEyeOff,
  IconPackage,
  IconRotateClockwise,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { useRoadmapData } from '@/hooks/useRoadmapData';
import { useAvailableSnapshots } from '@/hooks/useAvailableSnapshots';
import { useHistoricalRoadmapComparison } from '@/hooks/useHistoricalRoadmapComparison';
import {
  useHiddenItems,
  useHideRoadmapItem,
  useUnhideRoadmapItem,
} from '@/hooks/useHiddenItems';
import { canEditRoadmap, useCurrentUser } from '@/hooks/useCurrentUser';
import { ConfidenceBadge } from '@/components/roadmap/ConfidenceBadge';
import { StatusPill } from '@/components/roadmap/StatusPill';
import { InlineProgressBar } from '@/components/roadmap/InlineProgressBar';
import { RoadmapItemCard } from '@/components/roadmap/RoadmapItemCard';
import {
  RoadmapFilters,
  type RoadmapFiltersValue,
  type RoadmapViewMode,
} from '@/components/roadmap/RoadmapFilters';
import { SlideoutProvider, useSlideout } from '@/components/roadmap/slideout/SlideoutContext';
import { SlideoutContainer } from '@/components/roadmap/slideout/SlideoutContainer';
import { EpicHistoryView } from '@/components/roadmap/slideout/EpicHistoryView';
import type { RoadmapComparison } from '@/types/roadmap';

/** Natural sort for release names like "2025.7", "2025.8", "2025.10". */
function naturalReleaseCompare(a: string, b: string) {
  const re = /(\d+)(?:\.(\d+))?/;
  const am = a.match(re);
  const bm = b.match(re);
  const aMajor = am ? parseInt(am[1], 10) : 0;
  const aMinor = am && am[2] ? parseInt(am[2], 10) : 0;
  const bMajor = bm ? parseInt(bm[1], 10) : 0;
  const bMinor = bm && bm[2] ? parseInt(bm[2], 10) : 0;
  if (aMajor !== bMajor) return aMajor - bMajor;
  return aMinor - bMinor;
}

function fmtDate(value: string | null | undefined, fallback = 'TBD'): string {
  if (!value) return fallback;
  try {
    return format(new Date(value), 'MMM d');
  } catch {
    return fallback;
  }
}

const TIMELINE_FIELDS = new Set(['aha_start_date', 'aha_end_date', 'aha_release']);

export function RoadmapSnapshotView() {
  return (
    <SlideoutProvider>
      <RoadmapSnapshotInner />
      <SlideoutContainer />
    </SlideoutProvider>
  );
}

function RoadmapSnapshotInner() {
  const { data, isLoading, isError, error, refetch, isFetching } = useRoadmapData();
  const { data: availableSnapshots = [] } = useAvailableSnapshots();
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const { push } = useSlideout();

  const latestSnapshotDate = availableSnapshots[0]?.date ?? null;
  const isHistoricalMode = dateOverride != null && dateOverride !== latestSnapshotDate;
  const { data: historicalComparisons = [], isLoading: historicalLoading } =
    useHistoricalRoadmapComparison(isHistoricalMode ? dateOverride : null);

  const { data: me } = useCurrentUser();
  const canEdit = canEditRoadmap(me?.roles);
  const { data: hiddenRows = [] } = useHiddenItems(me?.id ?? null);
  const hideMutation = useHideRoadmapItem(me?.id ?? null);
  const unhideMutation = useUnhideRoadmapItem(me?.id ?? null);
  const hiddenSet = useMemo(
    () => new Set(hiddenRows.map((r) => r.aha_key)),
    [hiddenRows],
  );

  const liveComparisons: RoadmapComparison[] = data?.comparisons ?? [];
  const sourceComparisons = isHistoricalMode ? historicalComparisons : liveComparisons;

  // Build filter dimensions from the current source set + the
  // `allReleases` payload from `useRoadmapData` (which sees ALL releases,
  // not just the selected snapshot).
  const { availableStatuses, availableOwners, availableGoals, availablePods } = useMemo(() => {
    const statuses = new Set<string>();
    const owners = new Set<string>();
    const goals = new Set<string>();
    const pods = new Set<string>();
    sourceComparisons.forEach((c) => {
      if (c.latest.aha_status) statuses.add(c.latest.aha_status);
      if (c.latest.aha_owner) owners.add(c.latest.aha_owner);
      if (c.latest.aha_pod) pods.add(c.latest.aha_pod);
      // Goals can be HTML — keep raw text only
      if (c.latest.aha_primary_goal) {
        const text = c.latest.aha_primary_goal
          .replace(/<\/li>/gi, '|')
          .replace(/<[^>]+>/g, '')
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean);
        text.forEach((g) => goals.add(g));
      }
    });
    return {
      availableStatuses: Array.from(statuses).sort(),
      availableOwners: Array.from(owners).sort(),
      availableGoals: Array.from(goals).sort(),
      availablePods: Array.from(pods).sort(),
    };
  }, [sourceComparisons]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const availableReleases = useMemo(() => {
    const list = data?.allReleases ?? [];
    if (list.length === 0) {
      // Fall back to whatever is in the comparisons themselves
      const set = new Map<string, string | null>();
      sourceComparisons.forEach((c) => {
        const name = c.latest.aha_release || 'Unassigned';
        if (!set.has(name)) set.set(name, c.latest.aha_release_date || null);
      });
      return Array.from(set.entries())
        .map(([name, releaseDate]) => ({
          name,
          isPast: releaseDate
            ? (() => {
                const d = new Date(releaseDate);
                d.setHours(0, 0, 0, 0);
                return d < today;
              })()
            : false,
        }))
        .sort((a, b) => naturalReleaseCompare(a.name, b.name));
    }
    return list
      .map(({ name, releaseDate }) => {
        let isPast = false;
        if (releaseDate) {
          const d = new Date(releaseDate);
          d.setHours(0, 0, 0, 0);
          isPast = d < today;
        }
        return { name, isPast };
      })
      .sort((a, b) => naturalReleaseCompare(a.name, b.name));
  }, [data?.allReleases, sourceComparisons, today]);

  // The next-3-upcoming releases by release date (falls back to natural order).
  const next3Releases = useMemo(() => {
    const releaseDateByName = new Map<string, string | null>();
    sourceComparisons.forEach((c) =>
      releaseDateByName.set(c.latest.aha_release || '', c.latest.aha_release_date || null),
    );
    return availableReleases
      .filter((r) => !r.isPast)
      .sort((a, b) => {
        const ad = releaseDateByName.get(a.name);
        const bd = releaseDateByName.get(b.name);
        if (ad && bd) return new Date(ad).getTime() - new Date(bd).getTime();
        if (ad) return -1;
        if (bd) return 1;
        return naturalReleaseCompare(a.name, b.name);
      })
      .slice(0, 3)
      .map((r) => r.name);
  }, [availableReleases, sourceComparisons]);

  // Filters state
  const [filters, setFilters] = useState<RoadmapFiltersValue>({
    search: '',
    status: null,
    owner: null,
    goal: null,
    pod: null,
    changeType: 'all',
    selectedReleases: [],
  });
  const [viewMode, setViewMode] = useState<RoadmapViewMode>('simple');

  // Initial-default release selection: stick to the next-3-upcoming until
  // the user explicitly changes it. Re-sync when the default list grows.
  const lastDefaultRef = useRef<string[]>([]);
  useEffect(() => {
    if (next3Releases.length === 0) return;
    setFilters((prev) => {
      const prevDefault = lastDefaultRef.current;
      const stillMatchesPrev =
        prevDefault.length === prev.selectedReleases.length &&
        prevDefault.every((r, i) => r === prev.selectedReleases[i]);
      if (prev.selectedReleases.length === 0 || stillMatchesPrev) {
        lastDefaultRef.current = [...next3Releases];
        return { ...prev, selectedReleases: next3Releases };
      }
      lastDefaultRef.current = [...next3Releases];
      return prev;
    });
  }, [next3Releases]);

  const filtered = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return sourceComparisons.filter((c) => {
      const name = (c.latest.aha_name || '').toLowerCase();
      const key = (c.latest.aha_key || '').toLowerCase();
      const rel = (c.latest.aha_release || '').toLowerCase();
      if (needle && !(name.includes(needle) || key.includes(needle) || rel.includes(needle))) {
        return false;
      }
      if (filters.status && c.latest.aha_status !== filters.status) return false;
      if (filters.owner && c.latest.aha_owner !== filters.owner) return false;
      if (filters.pod && c.latest.aha_pod !== filters.pod) return false;
      if (filters.goal) {
        const text = (c.latest.aha_primary_goal || '')
          .replace(/<\/li>/gi, '|')
          .replace(/<[^>]+>/g, '')
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean);
        if (!text.includes(filters.goal)) return false;
      }
      const releaseName = c.latest.aha_release || 'Unassigned';
      if (filters.selectedReleases.length > 0 && !filters.selectedReleases.includes(releaseName)) {
        return false;
      }
      const hasChange = c.changes.changedFields.length > 0 || c.changes.isNew;
      if (filters.changeType === 'new' && !c.changes.isNew) return false;
      if (filters.changeType === 'changed' && (!hasChange || c.changes.isNew)) return false;
      if (filters.changeType === 'unchanged' && hasChange) return false;
      // Hide-from-non-Product enforcement
      if (!canEdit && hiddenSet.has(c.latest.aha_key)) return false;
      return true;
    });
  }, [sourceComparisons, filters, canEdit, hiddenSet]);

  // Group by release, sort groups by release date asc, items by start date.
  const grouped = useMemo(() => {
    const groups = new Map<
      string,
      { release: string; releaseDate: string | null; items: RoadmapComparison[] }
    >();
    filtered.forEach((c) => {
      const release = c.latest.aha_release || 'Unassigned';
      if (!groups.has(release)) {
        groups.set(release, {
          release,
          releaseDate: c.latest.aha_release_date || null,
          items: [],
        });
      }
      const g = groups.get(release)!;
      g.items.push(c);
      // Prefer a non-empty release date if any item has one
      if (!g.releaseDate && c.latest.aha_release_date) g.releaseDate = c.latest.aha_release_date;
    });
    const arr = Array.from(groups.values()).sort((a, b) => {
      if (!a.releaseDate && !b.releaseDate) return naturalReleaseCompare(a.release, b.release);
      if (!a.releaseDate) return 1;
      if (!b.releaseDate) return -1;
      const diff = new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
      if (diff !== 0) return diff;
      return naturalReleaseCompare(a.release, b.release);
    });
    arr.forEach((g) =>
      g.items.sort((a, b) => {
        const ad = a.latest.aha_start_date;
        const bd = b.latest.aha_start_date;
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return new Date(ad).getTime() - new Date(bd).getTime();
      }),
    );
    return arr;
  }, [filtered]);

  const toggleHidden = (ahaKey: string) => {
    if (!me?.id) return;
    if (hiddenSet.has(ahaKey)) {
      unhideMutation.mutate(ahaKey);
    } else {
      hideMutation.mutate(ahaKey);
    }
  };

  const showLoader = isLoading || (isHistoricalMode && historicalLoading);
  if (showLoader && sourceComparisons.length === 0) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }
  if (isError && !isHistoricalMode) {
    return (
      <Paper p="md" withBorder bg="var(--color-white)">
        <Text c="red" size="sm">
          {error instanceof Error ? error.message : 'Failed to load roadmap snapshot.'}
        </Text>
      </Paper>
    );
  }

  const effectiveDate = isHistoricalMode ? dateOverride : latestSnapshotDate;
  const snapshotLabel = effectiveDate
    ? format(new Date(`${effectiveDate}T12:00:00Z`), 'MMM d, yyyy')
    : data?.maxCreatedAt
      ? new Date(data.maxCreatedAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—';

  return (
    <Stack gap="md" data-table-scope="app">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Group gap="sm" align="center" mb={2}>
            <Title order={3} style={{ color: 'var(--color-gray-900)' }}>
              {isHistoricalMode ? 'Historical snapshot' : "This week's snapshot"}
            </Title>
            {effectiveDate && (
              <Badge leftSection={<IconCalendar size={12} />} variant="light" color="violet">
                {snapshotLabel}
              </Badge>
            )}
            {isHistoricalMode && (
              <Badge color="yellow" variant="light">
                Historical view
              </Badge>
            )}
          </Group>
          <Text size="sm" style={{ color: 'var(--color-gray-600)' }}>
            {isHistoricalMode
              ? `Showing the snapshot as it existed on ${snapshotLabel}. "Changes" badges compare to the snapshot immediately before this date.`
              : `Updates from this week's snapshot. Defaults to the next 3 releases — use Filters to show more.${
                  isFetching ? ' · Refreshing…' : ''
                }`}
          </Text>
        </div>
      </Group>

      <RoadmapFilters
        value={filters}
        onChange={setFilters}
        availableStatuses={availableStatuses}
        availableOwners={availableOwners}
        availableGoals={availableGoals}
        availablePods={availablePods}
        availableReleases={availableReleases}
        defaultSelectedReleases={next3Releases}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        rightActions={
          <>
            {availableSnapshots.length > 0 && (
              <Select
                w={180}
                size="sm"
                data={availableSnapshots.map((s) => ({ value: s.date, label: s.date }))}
                value={dateOverride ?? latestSnapshotDate}
                onChange={(v) => setDateOverride(v)}
                placeholder="Snapshot date"
                leftSection={<IconCalendar size={14} />}
                styles={{
                  input: { color: 'var(--color-gray-900)', fontWeight: 500 },
                }}
              />
            )}
            {isHistoricalMode && (
              <Button
                variant="default"
                size="sm"
                leftSection={<IconRotateClockwise size={16} />}
                onClick={() => setDateOverride(null)}
              >
                Latest
              </Button>
            )}
          </>
        }
      />

      {grouped.length === 0 ? (
        <Paper withBorder p="xl" ta="center" bg="var(--color-white)">
          <Text size="sm" style={{ color: 'var(--color-gray-500)' }}>
            No epics match your current filters.
          </Text>
        </Paper>
      ) : (
        <Accordion
          multiple
          defaultValue={grouped.map((g) => g.release)}
          variant="separated"
          radius="md"
          chevronPosition="right"
          styles={{
            item: { background: 'var(--color-white)' },
            control: { background: 'var(--color-white)' },
            label: { paddingTop: 12, paddingBottom: 12 },
          }}
        >
          {grouped.map((group) => {
            const timelineShifts = group.items.filter((i) =>
              i.changes.changedFields.some((f) => TIMELINE_FIELDS.has(f)),
            ).length;
            return (
              <Accordion.Item key={group.release} value={group.release}>
                <Accordion.Control>
                  <Group gap="sm" wrap="nowrap" align="center">
                    <IconPackage size={18} color="var(--color-info-dark, #2563eb)" />
                    <Text fw={600} size="md" style={{ color: 'var(--color-gray-900)' }}>
                      {group.release}
                    </Text>
                    {group.releaseDate && (
                      <Text size="sm" style={{ color: 'var(--color-gray-600)' }}>
                        {format(new Date(group.releaseDate), 'MMM d, yyyy')}
                      </Text>
                    )}
                    <div style={{ flex: 1 }} />
                    <Badge size="sm" variant="light" color="gray">
                      {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                    </Badge>
                    {timelineShifts > 0 && (
                      <Badge size="sm" variant="light" color="orange">
                        {timelineShifts} timeline {timelineShifts === 1 ? 'shift' : 'shifts'}
                      </Badge>
                    )}
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  {viewMode === 'simple' ? (
                    <SimpleGroupTable
                      items={group.items}
                      hiddenSet={hiddenSet}
                      canEdit={canEdit}
                      onToggleHidden={toggleHidden}
                      onRowClick={(c) =>
                        push({
                          title: c.latest.aha_name || c.latest.aha_key,
                          description: c.latest.aha_key,
                          render: () => (
                            <EpicHistoryView
                              ahaKey={c.latest.aha_key}
                              comparison={{
                                latest: c.latest,
                                previous: c.previous,
                                changes: c.changes,
                              }}
                            />
                          ),
                        })
                      }
                    />
                  ) : (
                    <SimpleGrid cols={{ base: 1, lg: 2, xl: 3 }} spacing="md" mt="xs">
                      {group.items.map((c) => (
                        <RoadmapItemCard
                          key={c.latest.id}
                          comparison={c}
                          isHidden={hiddenSet.has(c.latest.aha_key)}
                          canEdit={canEdit}
                          onToggleHidden={() => toggleHidden(c.latest.aha_key)}
                          onClick={() =>
                            push({
                              title: c.latest.aha_name || c.latest.aha_key,
                              description: c.latest.aha_key,
                              render: () => (
                                <EpicHistoryView
                                  ahaKey={c.latest.aha_key}
                                  comparison={{
                                    latest: c.latest,
                                    previous: c.previous,
                                    changes: c.changes,
                                  }}
                                />
                              ),
                            })
                          }
                        />
                      ))}
                    </SimpleGrid>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}

      <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
        <Text
          span
          inherit
          component="button"
          type="button"
          onClick={() => refetch()}
          style={{
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--color-copper)',
            fontWeight: 500,
          }}
        >
          Refresh data
        </Text>
      </Text>
    </Stack>
  );
}

interface SimpleGroupTableProps {
  items: RoadmapComparison[];
  hiddenSet: Set<string>;
  canEdit: boolean;
  onToggleHidden: (ahaKey: string) => void;
  onRowClick: (c: RoadmapComparison) => void;
}

function SimpleGroupTable({
  items,
  hiddenSet,
  canEdit,
  onToggleHidden,
  onRowClick,
}: SimpleGroupTableProps) {
  return (
    <Box mt="xs" style={{ overflowX: 'auto' }}>
      <Table striped highlightOnHover layout="fixed">
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: '32%' }}>Item</Table.Th>
            <Table.Th style={{ width: '12%' }}>Confidence</Table.Th>
            <Table.Th style={{ width: '14%' }}>Status</Table.Th>
            <Table.Th style={{ width: '14%' }}>Contact</Table.Th>
            <Table.Th style={{ width: '12%' }}>Timeline</Table.Th>
            <Table.Th style={{ width: '12%' }}>Changes</Table.Th>
            {canEdit && <Table.Th style={{ width: '4%' }} />}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((c) => {
            const isHidden = hiddenSet.has(c.latest.aha_key);
            const hasTimelineChange = c.changes.changedFields.some((f) => TIMELINE_FIELDS.has(f));
            const hasOtherChange = c.changes.changedFields.some((f) => !TIMELINE_FIELDS.has(f));
            return (
              <Table.Tr
                key={c.latest.id}
                style={{
                  cursor: 'pointer',
                  opacity: isHidden ? 0.45 : 1,
                }}
                onClick={() => onRowClick(c)}
              >
                <Table.Td>
                  <Stack gap={4}>
                    <Text
                      size="sm"
                      fw={500}
                      lineClamp={2}
                      style={{ color: 'var(--color-gray-900)' }}
                    >
                      {c.latest.aha_name || c.latest.aha_key}
                    </Text>
                    <InlineProgressBar
                      progress={c.latest.aha_progress}
                      ahaKey={c.latest.aha_key}
                    />
                  </Stack>
                </Table.Td>
                <Table.Td onClick={(e) => e.stopPropagation()}>
                  <ConfidenceBadge
                    ahaKey={c.latest.aha_key}
                    ahaName={c.latest.aha_name || c.latest.aha_key}
                  />
                </Table.Td>
                <Table.Td>
                  <StatusPill status={c.latest.aha_status} />
                </Table.Td>
                <Table.Td>
                  <Stack gap={0}>
                    <Text size="sm" style={{ color: 'var(--color-gray-800)' }}>
                      {(c.latest.aha_owner || 'Unassigned').split('@')[0]}
                    </Text>
                    <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
                      {c.latest.aha_pod || 'No pod'}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" style={{ color: 'var(--color-gray-700)' }}>
                    {fmtDate(c.latest.aha_start_date)} → {fmtDate(c.latest.aha_end_date)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="wrap">
                    {c.changes.isNew && (
                      <Badge size="xs" variant="light" color="teal">
                        NEW
                      </Badge>
                    )}
                    {hasTimelineChange && !c.changes.isNew && (
                      <Badge size="xs" variant="light" color="orange">
                        Timeline
                      </Badge>
                    )}
                    {hasOtherChange && !c.changes.isNew && (
                      <Badge size="xs" variant="light" color="blue">
                        Details
                      </Badge>
                    )}
                    {!c.changes.isNew && !hasTimelineChange && !hasOtherChange && (
                      <Text size="xs" style={{ color: 'var(--color-gray-400)' }}>
                        —
                      </Text>
                    )}
                  </Group>
                </Table.Td>
                {canEdit && (
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Tooltip
                      label={isHidden ? 'Unhide' : 'Hide from non-Product users'}
                      withArrow
                      openDelay={300}
                    >
                      <ActionIcon
                        variant="subtle"
                        color={isHidden ? 'orange' : 'gray'}
                        size="sm"
                        onClick={() => onToggleHidden(c.latest.aha_key)}
                      >
                        {isHidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                )}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Box>
  );
}
