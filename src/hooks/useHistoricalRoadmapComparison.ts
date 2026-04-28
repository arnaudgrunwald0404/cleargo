'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { RoadmapComparison, RoadmapItem } from '@/types/roadmap';

const FIELDS_TO_COMPARE: (keyof RoadmapItem)[] = [
  'aha_start_date',
  'aha_end_date',
  'aha_status',
  'aha_owner',
  'aha_pod',
  'aha_t_shirt_est',
  'aha_release',
];

const SNAPSHOT_SELECT =
  'id, created_at, snapshot_date, aha_key, aha_name, aha_description, aha_start_date, aha_end_date, aha_status, aha_t_shirt_est, aha_primary_goal, aha_calculated_devs, aha_owner, aha_initial_est, aha_release, aha_release_date, aha_pod, jira_key, aha_csm_priority';

function rowToItem(row: Record<string, unknown>): RoadmapItem {
  return {
    id: String(row.id),
    created_at: String(row.created_at ?? ''),
    rank: undefined,
    aha_key: String(row.aha_key ?? ''),
    aha_name: String(row.aha_name ?? ''),
    aha_description: String(row.aha_description ?? ''),
    aha_start_date: row.aha_start_date != null ? String(row.aha_start_date) : '',
    aha_end_date: row.aha_end_date != null ? String(row.aha_end_date) : '',
    aha_status: String(row.aha_status ?? ''),
    aha_t_shirt_est: String(row.aha_t_shirt_est ?? ''),
    aha_primary_goal: String(row.aha_primary_goal ?? ''),
    aha_calculated_devs: String(row.aha_calculated_devs ?? ''),
    aha_owner: String(row.aha_owner ?? ''),
    aha_initial_est: String(row.aha_initial_est ?? ''),
    aha_release: String(row.aha_release ?? ''),
    aha_release_date: row.aha_release_date != null ? String(row.aha_release_date) : '',
    aha_components: '',
    aha_cross_functional_deps: '',
    aha_pod: String(row.aha_pod ?? ''),
    jira_key: String(row.jira_key ?? ''),
    aha_csm_priority: String(row.aha_csm_priority ?? ''),
  };
}

function normalize(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  return value;
}

/**
 * Build comparisons for a historical snapshot date by also fetching the
 * snapshot immediately before it, then diffing each epic's tracked fields.
 *
 * Returns the same shape as the live `useRoadmapData().comparisons`, so
 * the snapshot table can render its "Changes vs prior week" column for
 * any past date (not just the latest).
 */
export function useHistoricalRoadmapComparison(snapshotDate: string | null | undefined) {
  return useQuery({
    queryKey: ['historical-roadmap-comparison', snapshotDate ?? null],
    queryFn: async (): Promise<RoadmapComparison[]> => {
      if (!snapshotDate) return [];
      const supabase = createClient();

      // 1. Find the prior snapshot date (largest distinct date strictly less than the chosen one)
      const { data: priorRows, error: priorErr } = await supabase
        .from('roadmap_snapshot')
        .select('snapshot_date')
        .lt('snapshot_date', snapshotDate)
        .order('snapshot_date', { ascending: false })
        .limit(1);
      if (priorErr) throw priorErr;
      const priorDate = (priorRows?.[0]?.snapshot_date as string | undefined) ?? null;

      // 2. Fetch the chosen snapshot's rows (and the prior snapshot's, if any)
      const [chosenResult, priorResult] = await Promise.all([
        supabase
          .from('roadmap_snapshot')
          .select(SNAPSHOT_SELECT)
          .eq('snapshot_date', snapshotDate)
          .limit(10000),
        priorDate
          ? supabase
              .from('roadmap_snapshot')
              .select(SNAPSHOT_SELECT)
              .eq('snapshot_date', priorDate)
              .limit(10000)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (chosenResult.error) throw chosenResult.error;
      if (priorResult.error) throw priorResult.error;

      const chosenItems = (chosenResult.data ?? []).map((r) =>
        rowToItem(r as Record<string, unknown>),
      );
      const priorItems = (priorResult.data ?? []).map((r) =>
        rowToItem(r as Record<string, unknown>),
      );

      const priorByKey = new Map<string, RoadmapItem>();
      priorItems.forEach((it) => priorByKey.set(it.aha_key, it));

      return chosenItems.map<RoadmapComparison>((latest) => {
        const previous = priorByKey.get(latest.aha_key);
        const changedFields: string[] = [];
        if (previous) {
          FIELDS_TO_COMPARE.forEach((field) => {
            if (normalize(latest[field]) !== normalize(previous[field])) {
              changedFields.push(field);
            }
          });
        }
        return {
          latest,
          previous,
          changes: {
            isNew: !previous,
            isRemoved: false,
            changedFields,
          },
        };
      });
    },
    enabled: Boolean(snapshotDate),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
