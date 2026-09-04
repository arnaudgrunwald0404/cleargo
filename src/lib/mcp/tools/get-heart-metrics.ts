/**
 * Tool: get-heart-metrics
 *
 * The HEART dashboard for an epic — categories, metrics, latest values and
 * trend.
 *
 * No client threading here: the HEART service already resolves its own
 * service-role client (lib/heart/service.ts getClient -> getAdminClient), unlike
 * the success-measurement service.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEpicHeartDashboard } from '@/lib/heart';

export const InputSchema = z.object({
  epicId: z.string().describe('The epic UUID'),
  asOfDate: z.string().optional().describe('YYYY-MM-DD to read the dashboard as of a past date'),
});

export async function getHeartMetrics(
  _supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const dashboard = await getEpicHeartDashboard(parsed.data.epicId, {
    asOfDate: parsed.data.asOfDate,
  });

  if (!dashboard) {
    return {
      epicId: parsed.data.epicId,
      dashboard: null,
      note: 'No HEART configuration exists for this epic yet.',
    };
  }

  return { epicId: parsed.data.epicId, dashboard };
}
