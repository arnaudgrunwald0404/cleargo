/**
 * Tool: get-roadmap-movements
 *
 * What moved on the roadmap. The work is all in Postgres RPCs, so this picks the
 * right one for the horizon and passes the arguments through -- same as the HTTP
 * route does.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  horizon: z
    .enum(['weekly', 'quarterly', 'ytd', 'year', 'impact'])
    .optional()
    .describe('Default "year". "impact" returns movements categorised by PM-assessed impact.'),
  asOfDate: z
    .string()
    .optional()
    .describe('YYYY-MM-DD snapshot date, from list-roadmap-snapshots. Applies to year and impact.'),
});

export async function getRoadmapMovements(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const horizon = parsed.data.horizon ?? 'year';
  const dateArg = { as_of_date: parsed.data.asOfDate ?? null };

  if (horizon === 'impact' || horizon === 'year') {
    const rpc = horizon === 'impact' ? 'get_year_movements_with_impact' : 'get_all_year_release_movements';
    const { data, error } = await supabase.rpc(rpc, dateArg);
    if (error) return { error: error.message };
    return { horizon, movements: data ?? [], count: (data ?? []).length };
  }

  // The period RPCs take a release filter rather than a date.
  const rpcName =
    horizon === 'weekly'
      ? 'get_weekly_roadmap_changes'
      : horizon === 'quarterly'
        ? 'get_quarter_to_date_roadmap_changes'
        : 'get_year_to_date_roadmap_changes';

  const { data, error } = await supabase.rpc(rpcName, { releases: null });
  if (error) return { error: error.message };
  return { horizon, movements: data ?? [], count: (data ?? []).length };
}
