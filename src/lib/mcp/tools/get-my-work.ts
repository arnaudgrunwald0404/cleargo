/**
 * Tool: get-my-work
 *
 * Everything waiting on the authenticated caller, scoped to them by the OAuth
 * subject rather than by an id the model has to find first.
 *
 * All of the thinking lives in myWorkService, which exists because six surfaces
 * used to answer "what does this person owe" independently and disagreed about
 * ownership, which statuses still count as owed, and whether shipped or
 * cancelled epics drop off. This tool must not become a seventh: it passes an
 * email in and reshapes what comes back.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { getMyWork, type OwedCriterion } from '@/lib/services/myWorkService';

export const InputSchema = z.object({
  includeLaunchSide: z
    .boolean()
    .optional()
    .describe('Include GTM launch artifacts and unassigned launch work. Default true.'),
  includeStoryBriefs: z
    .boolean()
    .optional()
    .describe('Include Story Brief questions awaiting the caller. Default true.'),
});

function shape(item: OwedCriterion) {
  return {
    // What update-criterion-status writes against.
    statusRowId: item.id,
    epicId: item.epicId,
    epicName: item.epicName,
    label: item.label,
    category: item.category,
    gate: item.gate,
    status: item.status,
    dueDate: item.dueDate ?? null,
    conditionDueDate: item.conditionDueDate,
    tier: item.tier,
    targetLaunchDate: item.targetLaunchDate,
    postLaunch: item.postLaunch,
    lastUpdatedAt: item.lastUpdatedAt,
  };
}

export async function getMyWorkTool(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  auth: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const work = await getMyWork(auth.email, {
    supabase,
    includeLaunchSide: parsed.data.includeLaunchSide ?? true,
    includeStoryBriefs: parsed.data.includeStoryBriefs ?? true,
    includeDerivedDueDates: true,
  });

  return {
    forEmail: auth.email,
    // Awaiting a decision from this person.
    owed: work.owed.map(shape),
    // Already decided, and the decision is holding a launch. Kept separate
    // because "what do I owe" and "what is stuck" are different questions.
    blocked: work.blocked.map(shape),
    launchArtifacts: work.launchArtifacts,
    unassignedLaunchWork: work.unassignedLaunchWork,
    storyBriefs: work.storyBriefs,
    counts: {
      owed: work.owed.length,
      blocked: work.blocked.length,
      launchArtifacts: work.launchArtifacts.length,
      storyBriefs: work.storyBriefs.length,
    },
    // Per-source failures. A populated key means that section is incomplete,
    // not that it is empty -- say so rather than reporting zero.
    degraded: work.degraded,
  };
}
