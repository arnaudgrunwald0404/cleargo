'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { WeeklyMovement } from '@/types/roadmap';

export function useYearlyMovements(asOfDate?: string | null) {
  return useQuery({
    queryKey: ['yearly-movements', asOfDate],
    queryFn: async (): Promise<WeeklyMovement[]> => {
      const supabase = createClient();
      const effectiveDateStr = asOfDate ? new Date(asOfDate).toISOString().split('T')[0] : null;
      const { data, error } = await supabase.rpc('get_all_year_release_movements', {
        as_of_date: effectiveDateStr,
      } as { as_of_date: string | null });
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        weekStart: String(row.week_start ?? ''),
        weekEnd: String(row.week_end ?? ''),
        count: Number(row.movement_count ?? 0),
        items: (row.aha_keys as string[]) ?? [],
      }));
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
