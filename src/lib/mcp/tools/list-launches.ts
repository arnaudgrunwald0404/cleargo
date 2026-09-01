/**
 * Tool: list-launches
 *
 * Returns a summary of active launches (name, tier, target date, status).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function listLaunches(
  supabase: SupabaseClient,
  _args: Record<string, unknown>
): Promise<unknown> {
  const { data: launches, error } = await supabase
    .from('launch')
    .select('id, name, tier, target_launch_date, status, owner_email, archived, created_at, updated_at')
    .eq('archived', false)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message };
  }

  return {
    launches: launches ?? [],
    count: launches?.length ?? 0,
  };
}
