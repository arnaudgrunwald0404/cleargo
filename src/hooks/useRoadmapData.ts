'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  RoadmapComparison,
  RoadmapChangeHorizon,
  RoadmapChangeEvent,
  RoadmapDelayHistoryEntry,
  RoadmapDelayHistoryMap,
  RoadmapDataPayload,
  RoadmapHorizonSummary,
  RoadmapItem,
} from '@/types/roadmap';

const mapDelayHistory = (rows: Record<string, unknown>[]): RoadmapDelayHistoryMap =>
  rows.reduce<RoadmapDelayHistoryMap>((acc, row) => {
    const key = row.aha_key as string | undefined;
    if (!key) return acc;
    const entry: RoadmapDelayHistoryEntry = {
      ahaKey: key,
      latestSnapshotAt: (row.latest_snapshot_at as string) ?? null,
      latestEndDate: (row.latest_end_date as string) ?? null,
      totalDelayEvents: Number(row.total_delay_events ?? 0),
      totalDelayDays: Number(row.total_delay_days ?? 0),
      lastDelaySnapshot: (row.last_delay_snapshot as string) ?? null,
      ytdDelayEvents: Number(row.ytd_delay_events ?? 0),
      ytdDelayDays: Number(row.ytd_delay_days ?? 0),
    };
    acc[key] = entry;
    return acc;
  }, {});

export function useRoadmapData() {
  return useQuery({
    queryKey: ['roadmap-versions'],
    queryFn: async (): Promise<RoadmapDataPayload> => {
      const supabase = createClient();

      const [
        baseResult,
        weeklyResult,
        quarterlyResult,
        ytdResult,
        delayHistoryResult,
        yearlyMovementsResult,
        allReleasesResult,
      ] = await Promise.all([
        supabase.rpc('get_latest_and_previous_roadmap_versions'),
        supabase.rpc('get_weekly_roadmap_changes', { releases: null }),
        supabase.rpc('get_quarter_to_date_roadmap_changes', { releases: null }),
        supabase.rpc('get_year_to_date_roadmap_changes', { releases: null }),
        supabase.from('roadmap_delay_history').select('*'),
        supabase.rpc('get_all_year_release_movements'),
        supabase
          .from('roadmap_snapshot')
          .select('aha_release, aha_release_date')
          .not('aha_release', 'is', null)
          .neq('aha_release', '')
          .order('snapshot_date', { ascending: false })
          .limit(50000),
      ]);

      const { data, error } = baseResult;
      if (error) throw error;
      if (!data) throw new Error('No roadmap data returned');

      const roadmapData = data as Record<string, unknown>[];

      const horizonResults = [
        { horizon: 'weekly' as const, result: weeklyResult },
        { horizon: 'quarterly' as const, result: quarterlyResult },
        { horizon: 'ytd' as const, result: ytdResult },
      ];

      const horizonChanges = horizonResults.reduce(
        (acc, { horizon, result }) => {
          if (result.error) throw result.error;
          const rows = (result.data ?? []) as Record<string, unknown>[];
          const events: RoadmapChangeEvent[] = rows.map((row) => ({
            id: null,
            ahaKey: row.aha_key as string,
            ahaName: (row.aha_name as string) ?? (row.aha_key as string),
            release: (row.aha_release as string) ?? null,
            createdAt: (row.created_at as string) ?? null,
            previousCreatedAt: (row.previous_created_at as string) ?? null,
            snapshotWeek: (row.snapshot_week as string) ?? null,
            previousSnapshotWeek: (row.previous_snapshot_week as string) ?? null,
            isNew: Boolean(row.is_new_item),
            timelineChanged: Boolean(row.release_changed),
            scopeChanged: false,
            operationalChange: false,
            statusChanged: false,
            ownerChanged: false,
            podChanged: false,
            releaseChanged: Boolean(row.release_changed),
            releaseDateChanged: false,
            startDateChanged: false,
            endDateChanged: false,
            tShirtChanged: false,
            goalChanged: false,
            capacityChanged: false,
            estimateChanged: false,
            descriptionChanged: false,
            hasUndefinedValues: false,
            previouslyUndefined: false,
            undefinedToDefined: false,
            definedToUndefined: false,
            delayEvent: false,
            delayDays: 0,
            changeCount: Boolean(row.release_changed) ? 1 : 0,
            changeTags: Boolean(row.release_changed) ? ['release'] : [],
            hasAnyChange: Boolean(row.release_changed) || Boolean(row.is_new_item),
            materialChange: Boolean(row.release_changed),
            informationalChange: false,
            snapshotDate: (row.snapshot_week as string) ?? null,
            periodStart: (row.previous_snapshot_week as string) ?? null,
            trackedChange: Boolean(row.release_changed),
          }));

          const snapshotDate =
            rows.length > 0 ? (rows[0].snapshot_week as string | null) ?? null : null;
          const periodStart =
            rows.length > 0 ? (rows[0].previous_snapshot_week as string | null) ?? null : null;

          acc[horizon] = {
            horizon,
            snapshotDate,
            periodStart,
            events,
          } satisfies RoadmapHorizonSummary;
          return acc;
        },
        {} as Record<RoadmapChangeHorizon, RoadmapHorizonSummary>,
      );

      if (delayHistoryResult.error) throw delayHistoryResult.error;
      if (yearlyMovementsResult.error) throw yearlyMovementsResult.error;

      const groupedData: Record<string, RoadmapItem[]> = {};

      roadmapData.forEach((item: Record<string, unknown>) => {
        const mappedItem: RoadmapItem = {
          id: String(item.id),
          created_at: String(item.created_at ?? ''),
          rank: item.rank != null ? Number(item.rank) : undefined,
          aha_key: String(item.aha_key ?? ''),
          aha_name: String(item.aha_name ?? ''),
          aha_description: String(item.aha_description ?? ''),
          aha_start_date: item.aha_start_date != null ? String(item.aha_start_date) : '',
          aha_end_date: item.aha_end_date != null ? String(item.aha_end_date) : '',
          aha_status: String(item.aha_status ?? ''),
          aha_t_shirt_est: String(item.aha_t_shirt_est ?? ''),
          aha_primary_goal: String(item.aha_primary_goal ?? ''),
          aha_calculated_devs: String(item.aha_calculated_devs ?? ''),
          aha_owner: String(item.aha_owner ?? ''),
          aha_initial_est: String(item.aha_initial_est ?? ''),
          aha_release: String(item.aha_release ?? ''),
          aha_release_date: item.aha_release_date != null ? String(item.aha_release_date) : '',
          aha_components: '',
          aha_cross_functional_deps: '',
          aha_pod: String(item.aha_pod ?? ''),
          jira_key: String(item.jira_key ?? ''),
          aha_csm_priority: String(item.aha_csm_priority ?? ''),
          aha_progress:
            item.aha_progress != null && item.aha_progress !== ''
              ? Number(item.aha_progress)
              : null,
        };

        if (!groupedData[mappedItem.aha_key]) {
          groupedData[mappedItem.aha_key] = [];
        }
        groupedData[mappedItem.aha_key].push(mappedItem);
      });

      const latestSnapshotDate =
        roadmapData.length > 0
          ? roadmapData.reduce((max: string, item: Record<string, unknown>) => {
              const ca = item.created_at as string | undefined;
              if (!ca) return max;
              return !max || new Date(ca) > new Date(max) ? ca : max;
            }, '')
          : null;

      const latestSnapshotDateStr = latestSnapshotDate
        ? new Date(latestSnapshotDate).toISOString().split('T')[0]
        : null;

      const comparisons: RoadmapComparison[] = [];

      Object.entries(groupedData).forEach(([, items]) => {
        const sortedItems = items.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
        const latest = sortedItems[0];
        const previous = sortedItems[1];

        const latestItemDate = latest.created_at
          ? new Date(latest.created_at).toISOString().split('T')[0]
          : null;
        const isInLatestSnapshot = latestItemDate === latestSnapshotDateStr;

        const changedFields: string[] = [];

        if (previous && isInLatestSnapshot) {
          const fieldsToCompare: (keyof RoadmapItem)[] = [
            'aha_start_date',
            'aha_end_date',
            'aha_status',
            'aha_owner',
            'aha_pod',
            'aha_t_shirt_est',
            'aha_release',
          ];

          fieldsToCompare.forEach((field) => {
            const latestValue = latest[field];
            const previousValue = previous[field];

            const normalizeValue = (val: unknown) => {
              if (val === null || val === undefined || val === '') return null;
              return val;
            };

            const normalizedLatest = normalizeValue(latestValue);
            const normalizedPrevious = normalizeValue(previousValue);

            if (normalizedLatest !== normalizedPrevious) {
              changedFields.push(field);
            }
          });
        }

        const isNew = !previous;

        comparisons.push({
          latest,
          previous,
          changes: {
            isNew,
            isRemoved: false,
            changedFields,
          },
        });
      });

      let maxCreatedAt: string | null = null;
      if (roadmapData.length > 0) {
        maxCreatedAt = roadmapData.reduce((max: string, item: Record<string, unknown>) => {
          const ca = item.created_at as string | undefined;
          if (!ca) return max;
          return !max || new Date(ca) > new Date(max) ? ca : max;
        }, '');
      }

      const yearlyMovements = (yearlyMovementsResult.data ?? []).map((row: Record<string, unknown>) => ({
        weekStart: String(row.week_start ?? ''),
        weekEnd: String(row.week_end ?? ''),
        count: Number(row.movement_count ?? 0),
        items: (row.aha_keys as string[]) ?? [],
      }));

      // Build release -> date map from the LATEST snapshot wins.
      // The query is ORDER BY snapshot_date DESC, so the first row we see
      // for a release name is from the most recent snapshot containing it.
      // Previously this loop preferred the earliest historical date, which
      // caused bugs like classifying "Release 2026.5" (currently scheduled
      // May 14) as past because an older snapshot once had it on an earlier
      // date — see https://github.com/arnaudgrunwald0404/cleargo (May 2026).
      const releaseMap = new Map<string, string | null>();
      if (allReleasesResult.data && !allReleasesResult.error) {
        (allReleasesResult.data as Record<string, unknown>[]).forEach((item) => {
          const releaseName = String(item.aha_release ?? '').trim();
          if (!releaseName) return;
          const itemDate = item.aha_release_date != null ? String(item.aha_release_date) : null;
          // First (= most recent) snapshot wins; only override if we
          // currently have null and now we found a non-null date.
          if (!releaseMap.has(releaseName)) {
            releaseMap.set(releaseName, itemDate);
          } else if (itemDate && releaseMap.get(releaseName) == null) {
            releaseMap.set(releaseName, itemDate);
          }
        });
      }

      // Defensively merge in any release names from `comparisons` that the
      // 50k-row pass missed (very recent / near the partition cap), and
      // backfill dates for releases whose latest-snapshot row was null.
      comparisons.forEach((comp) => {
        const releaseName = (comp.latest.aha_release || '').trim();
        if (!releaseName) return;
        const newDate = comp.latest.aha_release_date || null;
        if (!releaseMap.has(releaseName)) {
          releaseMap.set(releaseName, newDate);
          return;
        }
        if (newDate && releaseMap.get(releaseName) == null) {
          releaseMap.set(releaseName, newDate);
        }
      });

      const allReleases = Array.from(releaseMap.entries())
        .map(([name, releaseDate]) => ({ name, releaseDate }))
        .sort((a, b) => {
          const getParts = (str: string) => {
            const match = str.match(/(\d+)(?:\.(\d+))?/);
            if (!match) return [0, 0];
            return [parseInt(match[1], 10), match[2] ? parseInt(match[2], 10) : 0];
          };
          const [aMajor, aMinor] = getParts(a.name);
          const [bMajor, bMinor] = getParts(b.name);
          if (aMajor !== bMajor) return aMajor - bMajor;
          return aMinor - bMinor;
        });

      return {
        comparisons,
        maxCreatedAt,
        horizonChanges,
        delayHistory: mapDelayHistory(delayHistoryResult.data ?? []),
        yearlyMovements,
        allReleases,
      };
    },
  });
}
