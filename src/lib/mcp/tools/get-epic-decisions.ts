/**
 * Tool: get-epic-decisions
 *
 * Decisions recorded against an epic, newest first, with who took them.
 *
 * Wraps getDecisions rather than querying: the table is `decision_snapshot`
 * keyed on epic_id and the creator join is already written there. It resolves a
 * service-role client at module scope, so it is safe to call from here.
 *
 * Note the existing GET route has no authentication check at all. That is not
 * copied -- the OAuth layer authenticates every MCP call, and reproducing an
 * omission because it exists elsewhere is how one gap becomes two.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDecisions } from '@/lib/decisions';

export const InputSchema = z.object({
  epicId: z.string().describe('The epic UUID'),
});

export async function getEpicDecisions(
  _supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  try {
    const decisions = await getDecisions(parsed.data.epicId);
    return {
      epicId: parsed.data.epicId,
      decisions: decisions ?? [],
      count: (decisions ?? []).length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch decisions' };
  }
}
