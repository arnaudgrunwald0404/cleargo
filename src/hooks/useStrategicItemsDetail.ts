'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export type StrategicCategory = 'csm-priority' | 'with-goals' | 'combined';
export type StrategicPeriod = 'last-release' | 'quarter' | 'year';

export interface StrategicItemDetail {
  out_aha_key: string;
  out_aha_name: string;
  out_aha_status: string | null;
  out_aha_release: string | null;
  out_aha_csm_priority: string | null;
  out_aha_primary_goal: string | null;
  out_is_delivered: boolean;
  out_has_priority: boolean;
  out_has_goals: boolean;
}

/** Wraps `get_strategic_items_detail(p_category, p_period, as_of_date)`. */
export function useStrategicItemsDetail(
  category: StrategicCategory | null,
  period: StrategicPeriod | null,
  asOfDate?: string | null,
) {
  return useQuery({
    queryKey: ['strategic-items-detail', category, period, asOfDate ?? null],
    queryFn: async (): Promise<StrategicItemDetail[]> => {
      if (!category || !period) return [];
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_strategic_items_detail', {
        p_category: category,
        p_period: period,
        as_of_date: asOfDate ?? null,
      } as { p_category: string; p_period: string; as_of_date: string | null });
      if (error) throw error;
      return (data ?? []) as StrategicItemDetail[];
    },
    enabled: Boolean(category && period),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
