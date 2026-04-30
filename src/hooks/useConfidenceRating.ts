'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface ConfidenceRatingRow {
  id: string;
  aha_key: string;
  snapshot_date: string;
  calculated_confidence: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  calculated_percentage: number;
  pm_adjustment: number;
  final_confidence: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  final_percentage: number;
  last_calculated_at: string | null;
  author_email: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Read all confidence_rating rows for a specific epic (by aha_key).
 * Returns history newest-first; consumers can pick the latest.
 */
export function useConfidenceRating(ahaKey: string | null | undefined) {
  return useQuery({
    queryKey: ['confidence-rating', ahaKey],
    queryFn: async (): Promise<ConfidenceRatingRow[]> => {
      if (!ahaKey) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('confidence_rating')
        .select(
          'id, aha_key, snapshot_date, calculated_confidence, calculated_percentage, pm_adjustment, final_confidence, final_percentage, last_calculated_at, author_email, created_at, updated_at',
        )
        .eq('aha_key', ahaKey)
        .order('snapshot_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConfidenceRatingRow[];
    },
    enabled: Boolean(ahaKey),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export interface AdjustConfidenceArgs {
  ahaKey: string;
  snapshotDate: string;
  newAdjustment: number;
  note?: string;
}

/**
 * Persist a PM confidence adjustment. RLS enforces role gating on the table:
 * only PM/PRODUCT_OPS/CPO/SUPERADMIN can update `confidence_rating`.
 *
 * Note: this updates `pm_adjustment` and `final_*` only. The cron-driven
 * confidence job is responsible for recalculating `calculated_*` from snapshots.
 */
export function useAdjustConfidenceRating(currentEmail: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: AdjustConfidenceArgs) => {
      const supabase = createClient();
      const { data: existing, error: readErr } = await supabase
        .from('confidence_rating')
        .select('id, pm_adjustment, calculated_percentage, final_percentage')
        .eq('aha_key', args.ahaKey)
        .eq('snapshot_date', args.snapshotDate)
        .single();
      if (readErr) throw readErr;
      if (!existing) throw new Error('No confidence_rating row to adjust');

      const calculated = (existing as { calculated_percentage: number }).calculated_percentage;
      const newFinal = Math.max(0, Math.min(100, calculated + args.newAdjustment));
      const newLevel =
        newFinal <= 25
          ? 'very_low'
          : newFinal <= 45
            ? 'low'
            : newFinal <= 65
              ? 'medium'
              : newFinal <= 85
                ? 'high'
                : 'very_high';

      const { error: updErr } = await supabase
        .from('confidence_rating')
        .update({
          pm_adjustment: args.newAdjustment,
          final_percentage: newFinal,
          final_confidence: newLevel,
          author_email: currentEmail ?? null,
        })
        .eq('id', (existing as { id: string }).id);
      if (updErr) throw updErr;

      const { error: histErr } = await supabase
        .from('confidence_adjustment_history')
        .insert({
          aha_key: args.ahaKey,
          snapshot_date: args.snapshotDate,
          previous_adjustment: (existing as { pm_adjustment: number }).pm_adjustment ?? 0,
          new_adjustment: args.newAdjustment,
          adjustment_delta:
            args.newAdjustment - ((existing as { pm_adjustment: number }).pm_adjustment ?? 0),
          previous_final_percentage:
            (existing as { final_percentage: number }).final_percentage ?? calculated,
          new_final_percentage: newFinal,
          adjustment_note: args.note ?? null,
          author_email: currentEmail ?? '',
        });
      if (histErr) throw histErr;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['confidence-rating', vars.ahaKey] });
      qc.invalidateQueries({ queryKey: ['epic-confidence', vars.ahaKey] });
    },
  });
}
