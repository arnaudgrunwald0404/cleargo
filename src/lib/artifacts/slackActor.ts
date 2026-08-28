/**
 * Who is clicking the button.
 *
 * Slack gives us a user id; approval is capability-gated, so it has to resolve
 * to an `app_user` and their roles. Without this, "Approve" in Slack would be a
 * permission bypass around the web app's own checks — anyone in the workspace
 * who could see the message could promote a document to v1.0.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { canRolesPerform } from '@/lib/permissions';

export interface SlackActor {
    email: string | null;
    name: string | null;
    roles: string[];
    allowedToApprove: boolean;
    allowedToReview: boolean;
}

const UNKNOWN: SlackActor = {
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
        .select('email, first_name, last_name, roles')
        .eq('slack_handle', slackUserId)
        .maybeSingle();

    if (error || !data) return UNKNOWN;

    const row = data as {
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

    return {
        email: row.email,
        name,
        roles,
        // Same capabilities the HTTP route enforces, so Slack cannot be used to
        // do something the web app would refuse.
        allowedToApprove: canRolesPerform(roles, 'launchArtifact.approve'),
        allowedToReview: canRolesPerform(roles, 'launchArtifact.review'),
    };
}
