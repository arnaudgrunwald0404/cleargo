/**
 * Tool: set-impact-override
 *
 * Records a PM's judgement that a roadmap movement's impact differs from the
 * automatically assessed one, for a given week.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { actorCan } from '@/lib/permissions-server';

export const InputSchema = z.object({
  ahaKey: z.string().min(1).describe('The Aha reference, e.g. CC-EPIC-123'),
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('Monday of the week being overridden'),
  originalImpact: z.enum(['high', 'medium', 'low']).describe('The assessed impact being overridden'),
  overrideImpact: z.enum(['high', 'medium', 'low']).describe('The impact the PM judges it to be'),
  note: z.string().max(2000).optional().describe('Why the assessment was wrong'),
});

export async function setImpactOverride(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (!(await actorCan(actor, 'roadmap.impactOverride.write', supabase))) {
    return { error: 'You do not have permission to override movement impact.' };
  }

  const { error } = await supabase.from('pm_impact_override').upsert(
    {
      aha_key: parsed.data.ahaKey,
      week_start: parsed.data.weekStart,
      original_impact: parsed.data.originalImpact,
      override_impact: parsed.data.overrideImpact,
      override_note: parsed.data.note ?? null,
      author_email: actor.email,
    },
    { onConflict: 'aha_key,week_start' }
  );

  if (error) return { error: error.message };

  return {
    success: true,
    message: `Impact for ${parsed.data.ahaKey} in the week of ${parsed.data.weekStart} recorded as ${parsed.data.overrideImpact}.`,
  };
}
