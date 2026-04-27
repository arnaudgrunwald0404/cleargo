'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface SnapshotDate {
  date: string;
  timestamp: string;
}

export function useAvailableSnapshots() {
  return useQuery({
    queryKey: ['available-snapshots'],
    queryFn: async (): Promise<SnapshotDate[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('roadmap_snapshot')
        .select('snapshot_date, created_at')
        .order('snapshot_date', { ascending: false });
      if (error) throw error;
      if (!data?.length) return [];

      const byDate = new Map<string, string>();
      for (const row of data) {
        const d = row.snapshot_date as string;
        if (!d) continue;
        const ts = (row.created_at as string) || d;
        if (!byDate.has(d)) {
          byDate.set(d, ts);
        }
      }
      return Array.from(byDate.entries())
        .map(([date, timestamp]) => ({ date, timestamp }))
        .sort((a, b) => b.date.localeCompare(a.date));
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
