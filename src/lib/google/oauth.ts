/**
 * Google OAuth for ClearGO's Drive/Docs connection.
 *
 * One admin authorises once; the refresh token is stored globally on
 * app_settings and every later call mints its own access token. No human is
 * involved after the first consent.
 *
 * WHY GLOBAL, NOT PER-USER: launch documents are created by a background job
 * with nobody logged in, so the connection belongs to ClearGO rather than to a
 * person. When whoever connected it leaves, any admin reconnects and nothing
 * else changes — the documents themselves are owned by the shared drive.
 *
 * THE ONE SETTING THAT MATTERS: the OAuth consent screen must be **Internal**
 * and **published**. Left in Testing, Google expires refresh tokens after seven
 * days and you are reconnecting every week. Internal apps skip Google's
 * verification review, so this is a setting, not an approval process.
 *
 * This is the repo's first working refresh implementation — Rovo's is a stub
 * that throws, and the Calendar one was deleted in June.
 */
import { createAdminClient } from '@/lib/supabase/server';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';

/**
 * drive.file is NOT enough: it only covers files this app created, and the doc
 * factory must read templates it did not create in order to copy them.
 */
export const OAUTH_SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/userinfo.email',
] as const;

/** Refresh this far ahead of real expiry, matching the Rovo client's skew. */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

export interface GoogleConnection {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: string | null;
    connectedEmail: string | null;
    connectedAt: string | null;
    connectedBy: string | null;
}

export function getOAuthClientId(): string | null {
    return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || null;
}

function getOAuthClientSecret(): string | null {
    return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || null;
}

/** True when an admin could start the flow at all. */
export function isOAuthConfigured(): boolean {
    return Boolean(getOAuthClientId() && getOAuthClientSecret());
}

/**
 * Computed at runtime rather than read from an env var, so the same build works
 * on localhost, a deploy preview and production without a third setting to keep
 * in sync. Must match a redirect URI registered on the OAuth client.
 */
export function getRedirectUri(origin: string): string {
    const base = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '');
    return `${base}/api/integrations/google/oauth`;
}

export function buildAuthorizeUrl(origin: string, state: string): string {
    const params = new URLSearchParams({
        client_id: getOAuthClientId() ?? '',
        redirect_uri: getRedirectUri(origin),
        response_type: 'code',
        scope: OAUTH_SCOPES.join(' '),
        // offline + consent is what produces a refresh token. Without `consent`,
        // Google omits the refresh token on re-authorisation, which silently
        // yields a connection that dies in an hour and cannot renew.
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
    const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
    });
    const data = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || data.error) {
        throw new Error(
            `Google token request failed (${res.status}): ${data.error_description || data.error || 'unknown'}`
        );
    }
    return data;
}

/** Exchange the one-time authorisation code and persist the connection. */
export async function exchangeCodeAndStore(
    code: string,
    origin: string,
    connectedBy: string
): Promise<{ email: string | null }> {
    const data = await postToken({
        code,
        client_id: getOAuthClientId() ?? '',
        client_secret: getOAuthClientSecret() ?? '',
        redirect_uri: getRedirectUri(origin),
        grant_type: 'authorization_code',
    });

    if (!data.refresh_token) {
        // Almost always means prompt=consent was dropped, or the user had
        // already granted and Google reissued without one. Refusing here is
        // better than storing a connection that expires in an hour.
        throw new Error(
            'Google returned no refresh token. Revoke ClearGO at myaccount.google.com/permissions and reconnect.'
        );
    }

    const email = await fetchConnectedEmail(data.access_token ?? '');
    await storeTokens({
        accessToken: data.access_token ?? null,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in ?? 3600,
        connectedEmail: email,
        connectedBy,
    });

    return { email };
}

/** Who Google says the token belongs to — shown on the settings page. */
async function fetchConnectedEmail(accessToken: string): Promise<string | null> {
    if (!accessToken) return null;
    try {
        const res = await fetch(USERINFO_ENDPOINT, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { email?: string };
        return data.email ?? null;
    } catch {
        return null;
    }
}

async function storeTokens(input: {
    accessToken: string | null;
    refreshToken: string | null;
    expiresIn: number;
    connectedEmail?: string | null;
    connectedBy?: string | null;
}): Promise<void> {
    const supabase = createAdminClient();
    const expiresAt = new Date(Date.now() + input.expiresIn * 1000).toISOString();

    const patch: Record<string, unknown> = {
        google_access_token: input.accessToken,
        google_token_expires_at: expiresAt,
    };

    // A refresh response omits the refresh token; overwriting with null would
    // destroy the connection it just renewed.
    if (input.refreshToken) patch.google_refresh_token = input.refreshToken;
    if (input.connectedEmail !== undefined) patch.google_connected_email = input.connectedEmail;
    if (input.connectedBy !== undefined) {
        patch.google_connected_by = input.connectedBy;
        patch.google_connected_at = new Date().toISOString();
    }

    const { error } = await supabase.from('app_settings').update(patch).eq('id', 1);
    if (error) throw new Error(`Could not store the Google connection: ${error.message}`);
}

export async function getConnection(): Promise<GoogleConnection> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('app_settings')
        .select(
            'google_access_token, google_refresh_token, google_token_expires_at, google_connected_email, google_connected_at, google_connected_by'
        )
        .eq('id', 1)
        .maybeSingle();

    const row = (data ?? {}) as Record<string, string | null>;
    return {
        accessToken: row.google_access_token ?? null,
        refreshToken: row.google_refresh_token ?? null,
        expiresAt: row.google_token_expires_at ?? null,
        connectedEmail: row.google_connected_email ?? null,
        connectedAt: row.google_connected_at ?? null,
        connectedBy: row.google_connected_by ?? null,
    };
}

/** A usable connection means a refresh token — the access token is disposable. */
export async function isOAuthConnected(): Promise<boolean> {
    return Boolean((await getConnection()).refreshToken);
}

export function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return true;
    const at = new Date(expiresAt).getTime();
    if (Number.isNaN(at)) return true;
    return at - EXPIRY_SKEW_MS <= Date.now();
}

/**
 * A valid access token, refreshing if needed. Returns null when there is no
 * connection at all, so callers can fall back to the service account.
 */
export async function getOAuthAccessToken(): Promise<string | null> {
    const connection = await getConnection();
    if (!connection.refreshToken) return null;

    if (connection.accessToken && !isExpired(connection.expiresAt)) {
        return connection.accessToken;
    }

    if (!isOAuthConfigured()) {
        throw new Error(
            'Google is connected but GOOGLE_OAUTH_CLIENT_ID/SECRET are missing, so the token cannot be refreshed.'
        );
    }

    let data: TokenResponse;
    try {
        data = await postToken({
            client_id: getOAuthClientId() ?? '',
            client_secret: getOAuthClientSecret() ?? '',
            refresh_token: connection.refreshToken,
            grant_type: 'refresh_token',
        });
    } catch (err) {
        // invalid_grant means the refresh token is dead — revoked, or expired
        // because the consent screen is still in Testing mode. Say which,
        // because the fix differs.
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('invalid_grant')) {
            throw new Error(
                'The Google connection has expired or been revoked. Reconnect in Admin > Settings > Integrations > Google. ' +
                'If this recurs weekly, the OAuth consent screen is still in Testing mode — set it to Internal and publish.'
            );
        }
        throw err;
    }

    if (!data.access_token) throw new Error('Google refresh returned no access token');

    await storeTokens({
        accessToken: data.access_token,
        // Google usually omits this on refresh; storeTokens keeps the existing one.
        refreshToken: data.refresh_token ?? null,
        expiresIn: data.expires_in ?? 3600,
    });

    return data.access_token;
}

/** Disconnect, revoking at Google rather than only forgetting locally. */
export async function disconnect(): Promise<{ revoked: boolean }> {
    const connection = await getConnection();
    let revoked = false;

    if (connection.refreshToken) {
        try {
            const res = await fetch(REVOKE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ token: connection.refreshToken }),
            });
            revoked = res.ok;
        } catch {
            // Clearing locally still matters even if Google is unreachable.
        }
    }

    const supabase = createAdminClient();
    await supabase
        .from('app_settings')
        .update({
            google_access_token: null,
            google_refresh_token: null,
            google_token_expires_at: null,
            google_connected_email: null,
            google_connected_at: null,
            google_connected_by: null,
        })
        .eq('id', 1);

    return { revoked };
}
