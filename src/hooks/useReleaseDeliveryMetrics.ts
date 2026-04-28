'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface ReleaseDeliveryMetricsRow {
  release_name: string;
  release_date: string;
  total_planned: number;
  total_delivered: number;
  items_in_progress: number;
  commitment_percentage: number;
  delivered_on_time: number;
  delivered_one_late: number;
  delivered_two_plus_late: number;
  on_time_percentage: number;
  one_late_percentage: number;
  two_plus_late_percentage: number;
  in_progress_on_time: number;
  in_progress_one_late: number;
  in_progress_two_plus_late: number;
}

/** Wraps `get_release_delivery_metrics(target_release text)`. Pass null for most-recent past release. */
export function useReleaseDeliveryMetrics(targetRelease: string | null = null) {
  return useQuery({
    queryKey: ['release-delivery-metrics', targetRelease],
    queryFn: async (): Promise<ReleaseDeliveryMetricsRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_release_delivery_metrics', {
        target_release: targetRelease,
      } as { target_release: string | null });
      if (error) throw error;
      return (data ?? []) as ReleaseDeliveryMetricsRow[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
