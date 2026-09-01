/**
 * Tool: get-launch
 *
 * Fetches a single launch by ID including criteria statuses, assets, and
 * linked epics.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
});

export async function getLaunch(supabase: SupabaseClient, args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }


  // Fetch launch
  const { data: launch, error: launchError } = await supabase
    .from('launch')
    .select(`
      *,
      launch_epic(id, epic_id, epic:epic(id, name, tier, status)),
      launch_criterion_status(
        id, criterion_id, status, owner_email, due_date,
        criterion:criterion_id(id, label, phase, category, gate, sort_order)
      ),
      launch_asset(id, label, status, owner_email, url, optional, sort_order)
    `)
    .eq('id', parsed.data.launchId)
    .single();

  if (launchError || !launch) {
    return { error: launchError?.message ?? 'Launch not found' };
  }

  return {
    id: launch.id,
    name: launch.name,
    tier: launch.tier,
    target_launch_date: launch.target_launch_date,
    status: launch.status,
    owner_email: launch.owner_email,
    readiness_pct: launch.readiness_pct,
    epics: launch.launch_epic || [],
    criteria: launch.launch_criterion_status || [],
    assets: launch.launch_asset || [],
  };
}