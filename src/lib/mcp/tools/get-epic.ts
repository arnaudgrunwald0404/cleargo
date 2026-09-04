/**
 * Tool: get-epic
 *
 * One epic in full, including the DERIVED release status.
 *
 * That last part is why this wraps getEpic rather than selecting the row: the
 * status the app shows is computed from retros and the release schedule, not
 * read from the column, so a raw select would report something users never see.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEpic } from '@/lib/epics';
import { resolveLaunchHolds } from '@/lib/services/launchHoldService';

export const InputSchema = z.object({
  epicId: z.string().describe('The epic UUID, from find-epics'),
  includeLaunchHolds: z
    .boolean()
    .optional()
    .describe('Also report GTM launches holding this epic back from shipping early. Default false.'),
});

export async function getEpicTool(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  let epic: Awaited<ReturnType<typeof getEpic>>;
  try {
    epic = await getEpic(parsed.data.epicId, supabase);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load epic' };
  }

  if (!epic) return { error: 'Epic not found' };

  const result: Record<string, unknown> = { epic };

  if (parsed.data.includeLaunchHolds) {
    const holds = await resolveLaunchHolds(supabase, [
      { id: epic.id as string, target_launch_date: epic.target_launch_date as string | null },
    ]);
    result.launchHolds = holds.get(epic.id as string) ?? null;
  }

  return result;
}
