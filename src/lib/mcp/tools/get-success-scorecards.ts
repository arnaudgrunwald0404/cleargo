/**
 * Tool: get-success-scorecards
 *
 * Post-launch scorecard snapshots for an epic, newest first.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEpicScorecards } from '@/lib/services/successMeasurementService';

export const InputSchema = z.object({
  epicId: z.string().describe('The epic UUID'),
  limit: z.number().int().min(1).max(50).optional().describe('Default 10'),
});

export async function getSuccessScorecards(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const scorecards = await getEpicScorecards(
    parsed.data.epicId,
    parsed.data.limit ?? 10,
    supabase
  );

  return { epicId: parsed.data.epicId, scorecards, count: scorecards.length };
}
