/**
 * Tool: find-epics
 *
 * Turns a name into an epic id. Without this the epic-side tools are unusable
 * from a conversation: everything downstream takes a UUID, and there was no
 * server-side way to look one up.
 *
 * Note this is `epic` (a release), not `launch` (the GTM record). search-launches
 * covers the other one; they are different tables and different work.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findEpics } from '@/lib/epics';

export const InputSchema = z.object({
  nameQuery: z.string().optional().describe('Case-insensitive substring of the epic name'),
  status: z
    .string()
    .optional()
    .describe('Stored status. Note the status the app displays is derived and can differ; get-epic returns the derived one.'),
  tier: z.string().optional().describe('Launch tier'),
  ownerEmail: z.string().optional().describe('Epic owner email'),
  releaseName: z.string().optional().describe('Release name, e.g. "2026.3"'),
  limit: z.number().int().min(1).max(100).optional().describe('Default 25'),
  includeArchived: z.boolean().optional().describe('Default false'),
});

export async function findEpicsTool(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  try {
    const epics = await findEpics(supabase, parsed.data);
    return { epics, count: epics.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to search epics' };
  }
}
