'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { RoadmapItem } from '@/types/roadmap';

/**
 * Fetches all `roadmap_snapshot` rows for a single past `snapshot_date`.
 * Equivalent in spirit to `useRoadmapData()` but pinned to a historical week
 * (no `previous` snapshot diff — consumers compare against latest themselves
 * or use the dedicated movement RPCs).
 */
export function useHistoricalRoadmapData(snapshotDate: string | null | undefined) {
  return useQuery({
    queryKey: ['historical-roadmap', snapshotDate ?? null],
    queryFn: async (): Promise<RoadmapItem[]> => {
      if (!snapshotDate) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('roadmap_snapshot')
        .select(
          'id, created_at, aha_key, aha_name, aha_description, aha_start_date, aha_end_date, aha_status, aha_t_shirt_est, aha_primary_goal, aha_calculated_devs, aha_owner, aha_initial_est, aha_release, aha_release_date, aha_pod, jira_key, aha_csm_priority, aha_progress',
        )
        .eq('snapshot_date', snapshotDate)
        .limit(10000);
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return rows.map((row) => ({
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
      }));
    },
    enabled: Boolean(snapshotDate),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
