/**
 * Tool: get-analytics
 *
 * One tool with a `report` enum rather than seven near-identical tools. The
 * connector's tool list is a prompt the model reads every turn; seven variations
 * on "an analytics report" crowd it out for no gain, since the arguments are the
 * same filters in every case.
 *
 * Gated on analytics.read, the same capability every analytics route checks.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { actorCan } from '@/lib/permissions-server';
import {
  getSuccessPlanCompletionRate,
  getCriteriaOnTimeRate,
  getRetroCompletionRate,
  getLaunchHygieneDistribution,
  getPMTimelinessByPM,
} from '@/lib/services/analyticsService';

export const InputSchema = z.object({
  report: z
    .enum([
      'success-plan-completion',
      'criteria-timeliness',
      'retro-completion',
      'launch-hygiene',
      'pm-timeliness',
    ])
    .describe('Which report to run'),
  tier: z.string().optional().describe('Filter to one launch tier'),
  pod: z.string().optional().describe('Filter to one pod'),
  dateRangeStart: z.string().optional().describe('YYYY-MM-DD'),
  dateRangeEnd: z.string().optional().describe('YYYY-MM-DD'),
});

export async function getAnalytics(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (!(await actorCan(actor, 'analytics.read', supabase))) {
    return { error: 'You do not have permission to read analytics.' };
  }

  const filters = {
    tier: parsed.data.tier,
    pod: parsed.data.pod,
    dateRangeStart: parsed.data.dateRangeStart,
    dateRangeEnd: parsed.data.dateRangeEnd,
  };

  try {
    switch (parsed.data.report) {
      case 'success-plan-completion':
        return { report: parsed.data.report, data: await getSuccessPlanCompletionRate(filters, supabase) };
      case 'criteria-timeliness':
        return { report: parsed.data.report, data: await getCriteriaOnTimeRate(filters, supabase) };
      case 'retro-completion':
        return { report: parsed.data.report, data: await getRetroCompletionRate(filters, supabase) };
      case 'launch-hygiene':
        return { report: parsed.data.report, data: await getLaunchHygieneDistribution(filters, supabase) };
      case 'pm-timeliness':
        return { report: parsed.data.report, data: await getPMTimelinessByPM(filters, supabase) };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to run report' };
  }
}
