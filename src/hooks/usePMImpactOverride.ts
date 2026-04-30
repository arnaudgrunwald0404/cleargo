'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export type ImpactLevel = 'high' | 'medium' | 'low';

export interface PMImpactOverrideRow {
  id: string;
  epic_id: string | null;
  aha_key: string;
  week_start: string;
  original_impact: ImpactLevel;
  override_impact: ImpactLevel;
  override_note: string | null;
  author_email: string | null;
  created_at: string;
  updated_at: string;
}

export function usePMImpactOverride(ahaKey: string | null | undefined) {
  return useQuery({
    queryKey: ['pm-impact-override', ahaKey],
    queryFn: async (): Promise<PMImpactOverrideRow[]> => {
      if (!ahaKey) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('pm_impact_override')
        .select('*')
        .eq('aha_key', ahaKey)
        .order('week_start', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PMImpactOverrideRow[];
    },
    enabled: Boolean(ahaKey),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export interface SetImpactOverrideArgs {
  ahaKey: string;
  weekStart: string;
  originalImpact: ImpactLevel;
  overrideImpact: ImpactLevel;
  note?: string;
}

/** Upsert (aha_key, week_start) — RLS gates writes to PM/PRODUCT_OPS/CPO/SUPERADMIN. */
export function useSetImpactOverride(currentEmail: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SetImpactOverrideArgs) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('pm_impact_override')
        .upsert(
          {
            aha_key: args.ahaKey,
            week_start: args.weekStart,
            original_impact: args.originalImpact,
            override_impact: args.overrideImpact,
            override_note: args.note ?? null,
            author_email: currentEmail ?? null,
          },
          { onConflict: 'aha_key,week_start' },
        );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pm-impact-override', vars.ahaKey] });
      qc.invalidateQueries({ queryKey: ['impact-categorized-movements'] });
      qc.invalidateQueries({ queryKey: ['period-release-movements'] });
    },
  });
}
