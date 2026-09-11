/**
 * Tool: list-forecasts
 *
 * Committed forecast links across epics — the portfolio view of what has an ARR
 * forecast and what it says, without opening each one.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
});

export async function listForecasts(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const { data, error } = await supabase
    .from('epic_forecast_link')
    .select(
      'id, epic_aha_id, url, generation_date, scenario, arr_incremental_2027_usd, arr_incremental_2028_usd, arr_churn_reduction_2027_usd, arr_churn_reduction_2028_usd, created_at, created_by'
    )
    .order('generation_date', { ascending: false })
    .limit(parsed.data.limit ?? 50);

  if (error) return { error: error.message };

  return { forecasts: data ?? [], count: (data ?? []).length };
}
