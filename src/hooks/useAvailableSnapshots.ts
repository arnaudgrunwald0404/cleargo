'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface SnapshotDate {
  date: string;
  timestamp: string;
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

export function useAvailableSnapshots() {
  return useQuery({
    queryKey: ['available-snapshots'],
    queryFn: async (): Promise<SnapshotDate[]> => {
      const supabase = createClient();

      const byDate = new Map<string, string>();

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from('roadmap_snapshot')
          .select('snapshot_date, created_at')
          .order('snapshot_date', { ascending: false })
          .range(from, to);
        if (error) throw error;
        if (!data?.length) break;

        for (const row of data) {
          const d = row.snapshot_date as string | null;
          if (!d) continue;
          const ts = (row.created_at as string | null) ?? d;
          if (!byDate.has(d)) {
            byDate.set(d, ts);
          }
        }

        if (data.length < PAGE_SIZE) break;
      }

      return Array.from(byDate.entries())
        .map(([date, timestamp]) => ({ date, timestamp }))
        .sort((a, b) => b.date.localeCompare(a.date));
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
