/**
 * Persistence for the MCP OAuth server.
 *
 * Every function here uses the service-role client: the tables have RLS on with
 * no policies (see 20260831000000_mcp_oauth.sql), so nothing else can reach them.
 * That is deliberate -- the authorize and token endpoints run before there is any
 * authenticated Supabase session to speak of.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings-db';
import {
    AUTHORIZATION_CODE_TTL_SECONDS,
    REFRESH_TOKEN_TTL_SECONDS,
} from './config';
import { hashRefreshToken } from './tokens';

export interface OAuthClient {
    client_id: string;
    client_name: string | null;
    redirect_uris: string[];
    scope: string | null;
    token_endpoint_auth_method: string;
}

export interface AuthorizationCodeRecord {
    code: string;
    client_id: string;
    user_email: string;
    redirect_uri: string;
    scope: string;
    code_challenge: string;
    resource: string | null;
    expires_at: string;
    consumed_at: string | null;
}

// ── Clients ─────────────────────────────────────────────────────────────────

export async function createClient(params: {
    clientId: string;
    clientName?: string;
    redirectUris: string[];
    scope?: string;
    tokenEndpointAuthMethod: string;
    metadata: Record<string, unknown>;
}): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin.from('mcp_oauth_client').insert({
        client_id: params.clientId,
        client_name: params.clientName ?? null,
        redirect_uris: params.redirectUris,
        scope: params.scope ?? null,
        token_endpoint_auth_method: params.tokenEndpointAuthMethod,
        metadata: params.metadata,
    });

    if (error) throw new Error(`Failed to register client: ${error.message}`);
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
    const admin = createAdminClient();
    const { data } = await admin
        .from('mcp_oauth_client')
        .select('client_id, client_name, redirect_uris, scope, token_endpoint_auth_method')
        .eq('client_id', clientId)
        .maybeSingle();

    return (data as OAuthClient | null) ?? null;
}

/**
 * Exact match, not prefix.
 *
 * A prefix or "starts with" comparison is the classic redirect_uri hole: a
 * registered `https://claude.ai/callback` would also accept
 * `https://claude.ai/callback.attacker.com`. Registered URIs are echoed back by
 * the client verbatim, so exact equality costs nothing.
 */
export function isRedirectUriRegistered(client: OAuthClient, redirectUri: string): boolean {
    return client.redirect_uris.includes(redirectUri);
}

// ── Authorization codes ─────────────────────────────────────────────────────

export async function createAuthorizationCode(params: {
    code: string;
    clientId: string;
    userEmail: string;
    redirectUri: string;
    scope: string;
    codeChallenge: string;
    resource?: string | null;
}): Promise<void> {
    const admin = createAdminClient();
    const expiresAt = new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000).toISOString();

    const { error } = await admin.from('mcp_oauth_authorization_code').insert({
        code: params.code,
        client_id: params.clientId,
        user_email: params.userEmail,
        redirect_uri: params.redirectUri,
        scope: params.scope,
        code_challenge: params.codeChallenge,
        code_challenge_method: 'S256',
        resource: params.resource ?? null,
        expires_at: expiresAt,
    });

    if (error) throw new Error(`Failed to store authorization code: ${error.message}`);
}

/**
 * Claim a code for exchange.
 *
 * The UPDATE ... WHERE consumed_at IS NULL is the single-use guarantee, and it
 * has to be the database's job rather than a read-then-write in the handler:
 * two token requests racing on the same code would both pass a read check and
 * both get tokens. Returns null when the code is unknown, expired, or already
 * spent -- the caller cannot tell those apart, and should not.
 */
export async function consumeAuthorizationCode(
    code: string
): Promise<AuthorizationCodeRecord | null> {
    const admin = createAdminClient();

    const { data } = await admin
        .from('mcp_oauth_authorization_code')
        .update({ consumed_at: new Date().toISOString() })
        .eq('code', code)
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .select('code, client_id, user_email, redirect_uri, scope, code_challenge, resource, expires_at, consumed_at')
        .maybeSingle();

    return (data as AuthorizationCodeRecord | null) ?? null;
}

/**
 * A spent code presented a second time means the code leaked. Everything issued
 * from that authorization is suspect, so drop all of the user's live refresh
 * tokens for that client and make them re-consent.
 */
export async function revokeTokensAfterCodeReplay(code: string): Promise<void> {
    const admin = createAdminClient();

    const { data: record } = await admin
        .from('mcp_oauth_authorization_code')
        .select('client_id, user_email')
        .eq('code', code)
        .maybeSingle();

    if (!record) return;

    console.warn(
        `[oauth] authorization code replay for client=${record.client_id} user=${record.user_email}; revoking its refresh tokens`
    );

    await admin
        .from('mcp_oauth_token')
        .update({ revoked_at: new Date().toISOString() })
        .eq('client_id', record.client_id)
        .eq('user_email', record.user_email)
        .is('revoked_at', null);
}

// ── Refresh tokens ──────────────────────────────────────────────────────────

export async function storeRefreshToken(params: {
    token: string;
    clientId: string;
    userEmail: string;
    scope: string;
    resource?: string | null;
}): Promise<void> {
    const admin = createAdminClient();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();

    const { error } = await admin.from('mcp_oauth_token').insert({
        token_hash: hashRefreshToken(params.token),
        client_id: params.clientId,
        user_email: params.userEmail,
        scope: params.scope,
        resource: params.resource ?? null,
        expires_at: expiresAt,
    });

    if (error) throw new Error(`Failed to store refresh token: ${error.message}`);
}

/**
 * Claim a refresh token, revoking it in the same statement.
 *
 * Rotation: the caller stores a fresh token on success. Same reasoning as
 * authorization codes -- the atomic update is what stops two concurrent refreshes
 * from both succeeding.
 */
export async function consumeRefreshToken(token: string): Promise<{
    client_id: string;
    user_email: string;
    scope: string;
    resource: string | null;
} | null> {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data } = await admin
        .from('mcp_oauth_token')
        .update({ revoked_at: now, last_used_at: now })
        .eq('token_hash', hashRefreshToken(token))
        .is('revoked_at', null)
        .gt('expires_at', now)
        .select('client_id, user_email, scope, resource')
        .maybeSingle();

    return data ?? null;
}

export async function revokeRefreshToken(token: string): Promise<void> {
    const admin = createAdminClient();
    await admin
        .from('mcp_oauth_token')
        .update({ revoked_at: new Date().toISOString() })
        .eq('token_hash', hashRefreshToken(token))
        .is('revoked_at', null);
}

/** Opportunistic cleanup; failure here is never worth failing a token request. */
export async function pruneExpired(): Promise<void> {
    try {
        const admin = createAdminClient();
        await admin.rpc('prune_mcp_oauth_expired');
    } catch (err) {
        console.error('[oauth] prune failed:', err);
    }
}

// ── The user behind a token ─────────────────────────────────────────────────

/**
 * Roles for an email, or null when the address may not hold a token at all.
 *
 * Two gates, and they are different questions. The domain allowlist decides
 * whether this person may connect; the app_user row decides what they can do
 * once connected. Someone on an allowlisted domain with no app_user row gets an
 * empty role list -- reads work, every capability-gated write is refused -- which
 * matches how the app treats a not-yet-provisioned user elsewhere.
 */
export async function resolveActor(
    email: string
): Promise<{ email: string; roles: string[] } | null> {
    const normalized = email.toLowerCase().trim();
    const domain = normalized.split('@')[1];
    if (!domain) return null;

    const settings = await getSettings();
    const allowlisted = settings.allowlisted_domains?.some(
        (d) => d?.toLowerCase().trim() === domain
    );
    if (!allowlisted) {
        console.warn(`[oauth] refusing token for non-allowlisted domain: ${domain}`);
        return null;
    }

    const admin = createAdminClient();
    const { data } = await admin
        .from('app_user')
        .select('roles, role')
        .ilike('email', normalized)
        .maybeSingle();

    const raw = data?.roles ?? data?.role;
    const roles = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];

    return { email: normalized, roles };
}
