/**
 * Tool: list-launches
 *
 * Returns a summary of active launches (name, tier, target date, status).
 */
import { z } from 'zod';
import { createAdminClient, type LaunchSummary } from '../client.js';

export async function listLaunches(_args: Record<string, unknown>): Promise<unknown> {
  const supabase = createAdminClient();

  const { data: launches, error } = await supabase
    .from('launch')
    .select('id, name, tier, target_launch_date, status, owner_email, archived, created_at, updated_at')
    .eq('archived', false)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message };
  }

  return {
    launches: (launches || []).map((l) => {
      const summary: LaunchSummary = l as LaunchSummary;
      return summary;
    }),
    count: launches?.length ?? 0,
  };
}