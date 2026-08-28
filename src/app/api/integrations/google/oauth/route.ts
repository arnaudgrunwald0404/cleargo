/**
 * Google Drive/Docs OAuth — authorize and callback in one route.
 *
 * Follows the Rovo integration's shape (capability gate, CSRF state cookie,
 * redirect back to the settings page with a result) rather than the deleted
 * Calendar one, which had no state parameter and no permission check.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import {
    buildAuthorizeUrl,
    exchangeCodeAndStore,
    isOAuthConfigured,
} from '@/lib/google/oauth';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'google_oauth_state';
const SETTINGS_PATH = '/admin/settings/integrations/google';

function settingsUrl(request: NextRequest, params: Record<string, string>): string {
    const base = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '');
    const qs = new URLSearchParams(params).toString();
    return `${base}${SETTINGS_PATH}${qs ? `?${qs}` : ''}`;
}

export async function GET(request: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: me } = await supabase
            .from('app_user')
            .select('roles')
            .ilike('email', user.email)
            .maybeSingle();

        const rules = await getEffectivePermissionRules();
        const roles = (me?.roles as string[]) || [];
        if (!canRolesPerformWithRules(roles, 'settings.update', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        // The user declined, or Google refused. Say so on the settings page
        // rather than leaving them on a blank callback URL.
        if (error) {
            return NextResponse.redirect(settingsUrl(request, { error }));
        }

        if (!isOAuthConfigured()) {
            return NextResponse.redirect(
                settingsUrl(request, {
                    error: 'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are not set.',
                })
            );
        }

        // ── Start the flow ──────────────────────────────────────────────────
        if (!code) {
            const newState = randomBytes(24).toString('hex');
            const response = NextResponse.redirect(
                buildAuthorizeUrl(request.nextUrl.origin, newState)
            );
            response.cookies.set(STATE_COOKIE, newState, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 600,
            });
            return response;
        }

        // ── Callback ────────────────────────────────────────────────────────
        const expected = request.cookies.get(STATE_COOKIE)?.value;
        if (!expected || !state || expected !== state) {
            // A mismatched state is either a stale tab or a forged callback;
            // neither should be exchanged for a token.
            return NextResponse.redirect(
                settingsUrl(request, { error: 'Authorization state did not match. Try again.' })
            );
        }

        const { email } = await exchangeCodeAndStore(code, request.nextUrl.origin, user.email);

        const response = NextResponse.redirect(
            settingsUrl(request, { connected: email ?? 'true' })
        );
        response.cookies.delete(STATE_COOKIE);
        return response;
    } catch (err) {
        console.error('Google OAuth error:', err);
        return NextResponse.redirect(
            settingsUrl(request, {
                error: err instanceof Error ? err.message : 'Could not connect to Google.',
            })
        );
    }
}
