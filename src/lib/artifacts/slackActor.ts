/**
 * Who is clicking the button.
 *
 * Slack gives us a user id; approval is capability-gated, so it has to resolve
 * to an `app_user` and their roles. Without this, "Approve" in Slack would be a
 * permission bypass around the web app's own checks — anyone in the workspace
 * who could see the message could promote a document to v1.0.
 */
import { createAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canRolesPerformWithRules, type CapabilityId } from '@/lib/permissions';
import { getEffectivePermissionRules } from '@/lib/settings-db';

export interface SlackActor {
    /**
     * `app_user.id`. Required, not cosmetic: `epic_criterion_status
     * .last_updated_by` and `audit_log.actor_id` are uuid FKs to `app_user`, so
     * without this a Slack write cannot attribute itself. Leaving it out is how
     * three artifact approval paths ended up writing an email into a uuid
     * column (see lib/artifacts/criterionCompletion.ts).
     */
    id: string | null;
    email: string | null;
    name: string | null;
    roles: string[];
    allowedToApprove: boolean;
    allowedToReview: boolean;
}

const UNKNOWN: SlackActor = {
    id: null,
    email: null,
    name: null,
    roles: [],
    allowedToApprove: false,
    allowedToReview: false,
};

export async function resolveActorFromSlack(
    slackUserId: string | undefined,
    supabase: ReturnType<typeof createAdminClient> = createAdminClient()
): Promise<SlackActor> {
    if (!slackUserId) return UNKNOWN;

    const { data, error } = await supabase
        .from('app_user')
        .select('id, email, first_name, last_name, roles')
        .eq('slack_handle', slackUserId)
        .maybeSingle();

    if (error || !data) return UNKNOWN;

    const row = data as {
        id: string;
        email: string;
        first_name?: string | null;
        last_name?: string | null;
        roles?: unknown;
    };

    const roles = Array.isArray(row.roles)
        ? (row.roles as string[])
        : row.roles
          ? [String(row.roles)]
          : [];

    const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || row.email;

    // EFFECTIVE rules, not DEFAULT_RULES. This previously used canRolesPerform,
    // whose comment claimed "same capabilities the HTTP route enforces" -- it
    // was not: every UI route resolves DB overrides via
    // getEffectivePermissionRules, so an admin who narrowed a capability in
    // Settings had narrowed it in the web app and not in Slack.
    const rules = await getEffectivePermissionRules(supabase);

    return {
        id: row.id,
        email: row.email,
        name,
        roles,
        allowedToApprove: canRolesPerformWithRules(roles, 'launchArtifact.approve', rules),
        allowedToReview: canRolesPerformWithRules(roles, 'launchArtifact.review', rules),
    };
}

/**
 * Capability check for any actor resolved above, against the same effective
 * rules the web app uses. Prefer this over the two booleans for new
 * capabilities rather than growing the interface one flag at a time.
 */
export async function actorCan(
    actor: Pick<SlackActor, 'roles'>,
    capability: CapabilityId,
    supabase: SupabaseClient = createAdminClient()
): Promise<boolean> {
    const rules = await getEffectivePermissionRules(supabase);
    return canRolesPerformWithRules(actor.roles, capability, rules);
}
