/**
 * Tool: update-criterion-status
 *
 * Scores one readiness criterion -- the thing people actually do in ClearGO
 * between launches, and the first write the connector has offered outside of
 * document drafting.
 *
 * Almost nothing happens here. scoreEpicCriterion already owns the capability
 * check, status normalisation, the Not Applicable rules, the audit row, the
 * status-history row, the gate sign-off nudge and the readiness recompute, and
 * it returns outcomes instead of throwing precisely so a caller like this one can
 * show the reason. Re-implementing any of that here would be a second answer to
 * a question that already has one.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { resolveMcpActor } from '../actor';
import {
  scoreEpicCriterion,
  SCOREABLE_STATUSES,
} from '@/lib/services/criterionStatusService';

export const InputSchema = z.object({
  epicId: z.string().describe('The epic (release) UUID'),
  statusRowId: z
    .string()
    .describe('The criterion status row id, as returned by get-epic-criteria (statusRowId)'),
  status: z
    .enum(SCOREABLE_STATUSES)
    .optional()
    .describe(
      'The score. CONDITIONAL and CONDITIONAL_GO mean the same thing. The unrated state is NOT_SET; there is no PENDING. NOT_APPLICABLE is refused on a gating criterion and requires the not_applicable feature flag.'
    ),
  notes: z.string().max(8000).nullish().describe('Status notes explaining the score'),
  condition: z
    .string()
    .max(4000)
    .nullish()
    .describe('For a Conditional Go: what must still be true'),
  conditionDueDate: z
    .string()
    .nullish()
    .describe('YYYY-MM-DD date the condition is due'),
});

export async function updateCriterionStatus(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  auth: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (
    typeof parsed.data.status === 'undefined' &&
    typeof parsed.data.notes === 'undefined' &&
    typeof parsed.data.condition === 'undefined' &&
    typeof parsed.data.conditionDueDate === 'undefined'
  ) {
    return { error: 'Nothing to update. Provide a status, notes, or a condition.' };
  }

  // Needed before the write, not after: the attribution columns are uuid FKs to
  // app_user, and the roles that gate the write are read from the same row.
  const actor = await resolveMcpActor(supabase, auth);
  if (!actor) {
    return {
      error: `No ClearGO user profile found for ${auth.email}, so this change could not be attributed to anyone.`,
    };
  }

  const result = await scoreEpicCriterion(
    parsed.data.epicId,
    parsed.data.statusRowId,
    {
      status: parsed.data.status,
      notes: parsed.data.notes,
      condition: parsed.data.condition,
      conditionDueDate: parsed.data.conditionDueDate,
    },
    actor,
    // Service-role client, and the recompute is awaited. recomputeEpicReadiness
    // defaults to the cookie-backed client, which authenticates as anon here and
    // would quietly rescore the epic against an empty criteria set.
    { supabase, readiness: 'await' }
  );

  if (result.outcome !== 'updated') {
    return { error: result.reason };
  }

  const row = result.row as Record<string, unknown>;

  return {
    success: true,
    message: result.statusChanged
      ? `Status changed from ${result.previousStatus ?? 'NOT_SET'} to ${row.status}.`
      : 'Saved. The status itself did not change.',
    criterion: {
      statusRowId: row.id,
      status: row.status,
      previousStatus: result.previousStatus,
      statusChanged: result.statusChanged,
      notes: row.current_status_notes ?? null,
      condition: row.condition ?? null,
      conditionDueDate: row.condition_due_date ?? null,
    },
    readiness: result.readiness,
    // Partial failures -- a dropped audit row, a failed recompute -- surface
    // nowhere else. The HTTP route drops these on the floor.
    warnings: result.warnings,
  };
}
