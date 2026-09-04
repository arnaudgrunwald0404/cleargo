/**
 * Tool: get-confidence-rating
 *
 * Confidence history for one Aha epic, newest snapshot first, including the
 * calculated score, any PM adjustment, and the final result.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  ahaKey: z.string().describe('The Aha reference, e.g. CC-EPIC-123'),
});

export async function getConfidenceRating(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const { data, error } = await supabase
    .from('confidence_rating')
    .select(
      'id, aha_key, snapshot_date, calculated_confidence, calculated_percentage, pm_adjustment, final_confidence, final_percentage, last_calculated_at, author_email, created_at, updated_at'
    )
    .eq('aha_key', parsed.data.ahaKey)
    .order('snapshot_date', { ascending: false });

  if (error) return { error: error.message };
  return { ahaKey: parsed.data.ahaKey, ratings: data ?? [], count: (data ?? []).length };
}
