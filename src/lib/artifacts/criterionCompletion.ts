/**
 * Marking the runway row done when an artifact is approved.
 *
 * This existed as the same six lines in three places — the web route
 * (api/launches/[id]/artifacts), the Slack approval path (reviewService), and
 * the MCP tool (review-artifact) — and all three wrote `actor.email` into
 * `launch_criterion_status.last_updated_by`.
 *
 * That column is `UUID REFERENCES app_user(id)` (20260314000001, never
 * altered), so Postgres rejected every one of those updates with an invalid
 * uuid syntax error. All three callers downgraded the failure to a warning, so
 * approving an artifact promoted the document to v1.0 and silently left the
 * criterion open: readiness, the gate chain, and the workback timeline never
 * saw the approval. Nobody was told.
 *
 * Resolving the actor to their `app_user.id` here means the three callers
 * cannot drift apart again, and none of them has to grow an id of its own —
 * none of the three actor resolvers carries one today.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CriterionCompletionResult {
    /** True only when a row was actually updated. */
    done: boolean;
    /** Human-readable reason, for the caller's `warnings` array. */
    warning?: string;
}

/**
 * Resolve an actor's email to their `app_user.id`.
 *
 * `.ilike` rather than `.eq`, matching how the rest of the app looks users up
 * by email (see resolveRoles in the launches artifacts route) — addresses are
 * stored with inconsistent case.
 */
export async function resolveAppUserId(
    supabase: SupabaseClient,
    email: string | null | undefined
): Promise<string | null> {
    if (!email) return null;
    const { data } = await supabase
        .from('app_user')
        .select('id')
        .ilike('email', email)
        .maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Mark the readiness criterion behind an approved artifact as DONE.
 *
 * `last_updated_by` is nullable, so an actor we cannot resolve still completes
 * the criterion rather than blocking the approval — the launch moving is what
 * matters, and losing the attribution is the lesser failure. The caller is told
 * either way.
 */
export async function markLaunchCriterionDone(
    supabase: SupabaseClient,
    args: { launchId: string; criterionId: string | null; actorEmail: string | null },
    now: string = new Date().toISOString()
): Promise<CriterionCompletionResult> {
    if (!args.criterionId) {
        return { done: false, warning: 'This artifact is not linked to a readiness criterion.' };
    }

    const actorId = await resolveAppUserId(supabase, args.actorEmail);

    const { error } = await supabase
        .from('launch_criterion_status')
        .update({ status: 'DONE', last_updated_at: now, last_updated_by: actorId })
        .eq('launch_id', args.launchId)
        .eq('criterion_id', args.criterionId);

    if (error) {
        return { done: false, warning: `Criterion not marked done: ${error.message}` };
    }

    return actorId
        ? { done: true }
        : {
              done: true,
              warning: `Criterion marked done, but ${args.actorEmail ?? 'the approver'} did not match a ClearGO user, so it is unattributed.`,
          };
}
