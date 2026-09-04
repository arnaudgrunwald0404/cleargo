/**
 * Tool: get-roadmap-delivery-metrics
 *
 * Delivery metrics for a release, or across the priority goals.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  scope: z
    .enum(['release', 'priorityGoals'])
    .optional()
    .describe('Default "release".'),
  targetRelease: z.string().optional().describe('Release name, when scope is "release"'),
  asOfDate: z.string().optional().describe('YYYY-MM-DD snapshot date'),
});

export async function getRoadmapDeliveryMetrics(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if ((parsed.data.scope ?? 'release') === 'priorityGoals') {
    const { data, error } = await supabase.rpc('get_priority_goals_delivery_metrics', {
      as_of_date: parsed.data.asOfDate ?? null,
    });
    if (error) return { error: error.message };
    return { scope: 'priorityGoals', metrics: data ?? [] };
  }

  const { data, error } = await supabase.rpc('get_release_delivery_metrics', {
    target_release: parsed.data.targetRelease ?? null,
    as_of_date: parsed.data.asOfDate ?? null,
  });
  if (error) return { error: error.message };
  return { scope: 'release', targetRelease: parsed.data.targetRelease ?? null, metrics: data ?? [] };
}
