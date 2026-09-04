/**
 * Tool: adjust-confidence
 *
 * Applies a PM adjustment to a confidence rating and records why.
 *
 * The rating update and the history append are one operation living in
 * lib/roadmap/confidenceWrite, shared with the HTTP route -- two transcriptions
 * of a two-write sequence is how a rating and its audit trail drift apart.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { actorCan } from '@/lib/permissions-server';
import { adjustConfidenceRating } from '@/lib/roadmap/confidenceWrite';

export const InputSchema = z.object({
  ahaKey: z.string().min(1).describe('The Aha reference, e.g. CC-EPIC-123'),
  snapshotDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('Which snapshot to adjust, from list-roadmap-snapshots'),
  newAdjustment: z
    .number()
    .int()
    .min(-20)
    .max(20)
    .describe('Percentage points to add to the calculated confidence, -20 to 20'),
  note: z.string().max(2000).optional().describe('Why the adjustment was made'),
});

export async function adjustConfidence(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (!(await actorCan(actor, 'roadmap.confidence.adjust', supabase))) {
    return { error: 'You do not have permission to adjust confidence ratings.' };
  }

  const result = await adjustConfidenceRating(supabase, {
    ahaKey: parsed.data.ahaKey,
    snapshotDate: parsed.data.snapshotDate,
    newAdjustment: parsed.data.newAdjustment,
    note: parsed.data.note,
    authorEmail: actor.email,
  });

  if (result.outcome !== 'updated') {
    return { error: result.reason };
  }

  return {
    success: true,
    message: `Confidence for ${parsed.data.ahaKey} is now ${result.finalPercentage}% (${result.finalConfidence}).`,
    finalPercentage: result.finalPercentage,
    finalConfidence: result.finalConfidence,
    previousAdjustment: result.previousAdjustment,
    previousFinalPercentage: result.previousFinalPercentage,
  };
}
