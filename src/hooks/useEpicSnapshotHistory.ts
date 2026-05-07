'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * One row per weekly snapshot for a single epic, ordered oldest → newest.
 * Mirrors the shape RRV's `useItemHistory` returned, but pulled directly
 * from `roadmap_snapshot` instead of via an RPC.
 */
export interface EpicSnapshotVersion {
  id: string;
  created_at: string;
  snapshot_date: string;
  /** 1-indexed sequence within this epic's history (oldest = 1). */
  version_number: number;
  aha_key: string;
  aha_name: string | null;
  aha_status: string | null;
  aha_start_date: string | null;
  aha_end_date: string | null;
  aha_release: string | null;
  aha_pod: string | null;
  gtm_module: string | null;
  gtm_name: string | null;
  aha_owner: string | null;
  aha_t_shirt_est: string | null;
  aha_csm_priority: string | null;
  aha_progress: number | null;
  aha_promoted_ideas_votes: number | null;
  jira_key: string | null;
}

export function useEpicSnapshotHistory(ahaKey: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['epic-snapshot-history', ahaKey],
    queryFn: async (): Promise<EpicSnapshotVersion[]> => {
      if (!ahaKey) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('roadmap_snapshot')
        .select(
          'id, created_at, snapshot_date, aha_key, aha_name, aha_status, aha_start_date, aha_end_date, aha_release, aha_pod, gtm_module, gtm_name, aha_owner, aha_t_shirt_est, aha_csm_priority, aha_progress, aha_promoted_ideas_votes, jira_key',
        )
        .eq('aha_key', ahaKey)
        .order('snapshot_date', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row, idx) => ({
        id: String(row.id),
        created_at: String(row.created_at),
        snapshot_date: String(row.snapshot_date),
        version_number: idx + 1,
        aha_key: String(row.aha_key),
        aha_name: row.aha_name as string | null,
        aha_status: row.aha_status as string | null,
        aha_start_date: row.aha_start_date as string | null,
        aha_end_date: row.aha_end_date as string | null,
        aha_release: row.aha_release as string | null,
        aha_pod: row.aha_pod as string | null,
        gtm_module: row.gtm_module as string | null,
        gtm_name: row.gtm_name as string | null,
        aha_owner: row.aha_owner as string | null,
        aha_t_shirt_est: row.aha_t_shirt_est as string | null,
        aha_csm_priority: row.aha_csm_priority as string | null,
        aha_progress: row.aha_progress as number | null,
        aha_promoted_ideas_votes: row.aha_promoted_ideas_votes as number | null,
        jira_key: row.jira_key as string | null,
      }));
    },
    enabled: enabled && Boolean(ahaKey),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
