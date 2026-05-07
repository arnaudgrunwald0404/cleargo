'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { PeriodReleaseMovement, WeeklyMovement } from '@/types/roadmap';

export function usePeriodReleaseMovements(
  weeks: WeeklyMovement[] | null,
  asOfDate?: string | null,
) {
  return useQuery({
    queryKey: [
      'period-release-movements',
      weeks?.map((w) => w.weekStart).sort().join(',') ?? '',
      asOfDate,
    ],
    queryFn: async (): Promise<PeriodReleaseMovement[]> => {
      if (!weeks?.length) return [];
      const supabase = createClient();
      const effectiveDateStr = asOfDate ? new Date(asOfDate).toISOString().split('T')[0] : null;
      const { data, error } = await supabase.rpc('get_year_movements_with_impact', {
        as_of_date: effectiveDateStr,
      } as { as_of_date: string | null });
      if (error) throw error;
      if (!data?.length) return [];
      const weekStartSet = new Set(weeks.map((w) => w.weekStart));
      return (data as Record<string, unknown>[])
        .filter((m) => weekStartSet.has(String(m.week_start)))
        .map((m) => ({
          aha_key: String(m.aha_key),
          aha_name: String(m.aha_name ?? m.aha_key),
          gtm_name: (m.gtm_name as string | null | undefined) ?? null,
          gtm_module: (m.gtm_module as string | null | undefined) ?? null,
          from_release: (m.from_release as string) ?? null,
          to_release: (m.to_release as string) ?? null,
          week_start: String(m.week_start),
          aha_csm_priority: (m.aha_csm_priority as string) ?? null,
          impact_level: m.impact_level as PeriodReleaseMovement['impact_level'],
          calculated_impact_level: m.calculated_impact_level as PeriodReleaseMovement['calculated_impact_level'],
          is_overridden: Boolean(m.is_overridden),
        }));
    },
    enabled: Boolean(weeks && weeks.length > 0),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
