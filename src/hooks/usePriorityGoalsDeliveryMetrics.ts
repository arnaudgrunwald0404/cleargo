'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface PriorityGoalsDeliveryMetricsRow {
  last_release_name: string | null;
  last_release_date: string | null;
  last_release_csm_priority_total: number;
  last_release_csm_priority_delivered: number;
  last_release_with_goals_total: number;
  last_release_with_goals_delivered: number;
  last_release_combined_total: number;
  last_release_combined_delivered: number;
  qtd_csm_priority_total: number;
  qtd_csm_priority_delivered: number;
  qtd_with_goals_total: number;
  qtd_with_goals_delivered: number;
  qtd_combined_total: number;
  qtd_combined_delivered: number;
  ytd_csm_priority_total: number;
  ytd_csm_priority_delivered: number;
  ytd_with_goals_total: number;
  ytd_with_goals_delivered: number;
  ytd_combined_total: number;
  ytd_combined_delivered: number;
  quarter_start: string;
  year_start: string;
}

/** Wraps `get_priority_goals_delivery_metrics(as_of_date date)`. */
export function usePriorityGoalsDeliveryMetrics(asOfDate?: string | null) {
  return useQuery({
    queryKey: ['priority-goals-delivery-metrics', asOfDate ?? null],
    queryFn: async (): Promise<PriorityGoalsDeliveryMetricsRow | null> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_priority_goals_delivery_metrics', {
        as_of_date: asOfDate ?? null,
      } as { as_of_date: string | null });
      if (error) throw error;
      const rows = (data ?? []) as PriorityGoalsDeliveryMetricsRow[];
      return rows[0] ?? null;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
