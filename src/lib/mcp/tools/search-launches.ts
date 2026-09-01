/**
 * Tool: search-launches
 *
 * Search launches by name or partial match.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  query: z.string().describe('Search term (matches against launch name)'),
  includeArchived: z.boolean().optional().describe('Include archived launches').default(false),
});

export async function searchLaunches(supabase: SupabaseClient, args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }


  let query = supabase
    .from('launch')
    .select('id, name, tier, target_launch_date, status, owner_email, archived, created_at')
    .ilike('name', `%${parsed.data.query}%`)
    .order('created_at', { ascending: false });

  if (!parsed.data.includeArchived) {
    query = query.eq('archived', false);
  }

  const { data: launches, error } = await query;

  if (error) {
    return { error: error.message };
  }

  return {
    launches: launches || [],
    count: launches?.length ?? 0,
    query: parsed.data.query,
  };
}