/**
 * Google connection status, and disconnect.
 *
 * Never returns a token — only whether one exists, who it acts as, and whether
 * the pieces the doc factory needs are configured.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getConnection, isOAuthConfigured, isExpired, disconnect } from '@/lib/google/oauth';
import { hasServiceAccountCredentials } from '@/lib/google/auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { ARTIFACT_REGISTRY } from '@/lib/artifacts/registry';
import { getTemplateId } from '@/lib/artifacts/registry';
import { ARTIFACT_TYPES } from '@/types/artifacts';

export const dynamic = 'force-dynamic';

async function requireSettingsUpdate(): Promise<{ email: string } | null> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return null;

    const { data: me } = await supabase
        .from('app_user')
        .select('roles')
        .ilike('email', user.email)
        .maybeSingle();

    const rules = await getEffectivePermissionRules();
    const roles = (me?.roles as string[]) || [];
    return canRolesPerformWithRules(roles, 'settings.update', rules) ? { email: user.email } : null;
}

async function getHandler() {
    const actor = await requireSettingsUpdate();
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const connection = await getConnection();

    // Which templates are configured — the other half of "is this ready".
    const templates = ARTIFACT_TYPES.map((type) => ({
        type,
        label: ARTIFACT_REGISTRY[type].label,
        configured: Boolean(getTemplateId(ARTIFACT_REGISTRY[type])),
    }));

    return NextResponse.json({
        oauthConfigured: isOAuthConfigured(),
        connected: Boolean(connection.refreshToken),
        connectedEmail: connection.connectedEmail,
        connectedAt: connection.connectedAt,
        connectedBy: connection.connectedBy,
        // An expired access token is normal and self-healing; surfaced only so
        // the page can say "refreshing" rather than looking broken.
        accessTokenExpired: isExpired(connection.expiresAt),
        serviceAccountFallback: hasServiceAccountCredentials(),
        launchFolderConfigured: Boolean(process.env.GOOGLE_LAUNCH_DRIVE_FOLDER_ID?.trim()),
        templates,
    });
}

async function deleteHandler() {
    const actor = await requireSettingsUpdate();
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { revoked } = await disconnect();
    console.log(`[google] disconnected by ${actor.email}, revoked at Google: ${revoked}`);
    return NextResponse.json({ disconnected: true, revoked });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const DELETE = withRateLimit(deleteHandler, RATE_LIMITS.default);
