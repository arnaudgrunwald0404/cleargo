/**
 * Server-side capability checks against the *effective* permission rules.
 *
 * `canRolesPerform` in @/lib/permissions is deliberately client-safe: it closes
 * over DEFAULT_RULES and imports nothing from the server. That makes it the
 * wrong check for anything running server-side, because an admin who narrows a
 * capability in Settings writes an override into `app_settings.permissions`,
 * and DEFAULT_RULES does not know about it.
 *
 * Every UI route already resolves overrides via getEffectivePermissionRules.
 * The Slack approval path did not, and that divergence was a real bug (see the
 * comment in lib/artifacts/slackActor.ts). The MCP connector had the same bug
 * for the same reason, which is why this now lives in one neutral module rather
 * than being re-derived per surface.
 *
 * No caching on purpose. The rules are one indexed single-row read, and caching
 * them on a client instance would reintroduce exactly the staleness this exists
 * to remove -- an admin's change would not take effect until the process
 * recycled.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { canRolesPerformWithRules, type CapabilityId } from '@/lib/permissions';
import { getEffectivePermissionRules } from '@/lib/settings-db';

/**
 * Anything carrying roles: a SlackActor, an McpAuthInfo, or an app_user row.
 * Structural on purpose -- callers should not have to adapt to a nominal type
 * just to ask whether someone may do something.
 */
export interface RoleBearer {
    roles: string[] | null | undefined;
}

export async function actorCan(
    actor: RoleBearer,
    capability: CapabilityId,
    supabase: SupabaseClient
): Promise<boolean> {
    const rules = await getEffectivePermissionRules(supabase);
    return canRolesPerformWithRules(actor.roles, capability, rules);
}
