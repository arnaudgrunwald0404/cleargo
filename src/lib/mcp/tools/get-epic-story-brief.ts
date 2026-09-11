/**
 * Tool: get-epic-story-brief
 *
 * The Story Brief authored on an epic, plus its change log.
 *
 * NOT the same thing as the `story_brief` launch artifact that get-artifact
 * returns. This one is an `epic_story_brief` row written per epic; that one is a
 * `launch_artifact` row on a GTM launch, and the launch view is derived from
 * these (see lib/story-brief/launch-brief.ts). The two are easy to conflate, so
 * the tool description says which is which.
 *
 * Read only. Editing means a version bump plus a change-log append, which is
 * ~250 lines inline in the route and would have to be extracted first.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  epicId: z.string().describe('The epic UUID'),
  includeChangeLog: z.boolean().optional().describe('Default true'),
});

export async function getEpicStoryBrief(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const { data: brief, error } = await supabase
    .from('epic_story_brief')
    .select('*')
    .eq('epic_id', parsed.data.epicId)
    .maybeSingle();

  if (error) return { error: error.message };

  if (!brief) {
    return {
      epicId: parsed.data.epicId,
      brief: null,
      note: 'No Story Brief has been written for this epic yet.',
    };
  }

  let changeLog: unknown[] = [];
  if (parsed.data.includeChangeLog !== false) {
    const { data: logRows } = await supabase
      .from('epic_story_brief_change_log')
      .select('*')
      .eq('epic_story_brief_id', (brief as { id: string }).id)
      .order('created_at', { ascending: false });
    changeLog = logRows ?? [];
  }

  return { epicId: parsed.data.epicId, brief, changeLog };
}
