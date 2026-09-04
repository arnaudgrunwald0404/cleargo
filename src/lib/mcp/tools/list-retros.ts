/**
 * Tool: list-retros
 *
 * Retrospectives for an epic, by day marker (the 30/60/90-style checkpoints).
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEpicRetros } from '@/lib/services/successMeasurementService';

export const InputSchema = z.object({
  epicId: z.string().describe('The epic UUID'),
});

export async function listRetros(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const retros = await getEpicRetros(parsed.data.epicId, supabase);

  return { epicId: parsed.data.epicId, retros, count: retros.length };
}
