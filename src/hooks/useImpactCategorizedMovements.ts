'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ImpactCategorizedMovement } from '@/types/roadmap';
import { format } from 'date-fns';

export function useImpactCategorizedMovements(asOfDate?: string | null) {
  return useQuery({
    queryKey: ['impact-categorized-movements', asOfDate],
    queryFn: async (): Promise<ImpactCategorizedMovement[]> => {
      const supabase = createClient();
      const effectiveDateStr = asOfDate ? format(new Date(asOfDate), 'yyyy-MM-dd') : null;
      const { data, error } = await supabase.rpc('get_year_movements_with_impact', {
        as_of_date: effectiveDateStr,
      } as { as_of_date: string | null });
      if (error) throw error;
      return (data ?? []) as ImpactCategorizedMovement[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
