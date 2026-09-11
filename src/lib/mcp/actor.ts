/**
 * The OAuth caller as an `app_user`.
 *
 * McpAuthInfo carries an email and the roles baked into the access token at mint
 * time. That is enough to gate a read, but not enough to write: attribution
 * columns like `epic_criterion_status.last_updated_by` and `audit_log.actor_id`
 * are uuid FKs to app_user, so a write needs the row's id. Writing an email into
 * a uuid column is how three artifact approval paths went wrong before (see
 * lib/artifacts/criterionCompletion.ts).
 *
 * Roles come from the database rather than the token. A token lives an hour and
 * a role change should not wait it out, and this lookup is already happening for
 * the id.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';

export interface McpActor {
    id: string;
    email: string;
    roles: string[];
}

export async function resolveMcpActor(
    supabase: SupabaseClient,
    auth: McpAuthInfo
): Promise<McpActor | null> {
    const { data, error } = await supabase
        .from('app_user')
        .select('id, email, roles')
        .eq('email', auth.email)
        .maybeSingle();

    if (error || !data) return null;

    const row = data as { id: string; email: string; roles?: unknown };

    // The column has been both an array and a scalar over its life; the HTTP
    // route coerces the same way.
    const roles = Array.isArray(row.roles)
        ? (row.roles as string[])
        : row.roles
          ? [String(row.roles)]
          : [];

    return { id: row.id, email: row.email, roles };
}
