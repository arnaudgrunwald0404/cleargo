/**
 * Minting and checking the two credentials the MCP connector hands out.
 *
 * Access token  -- stateless signed JWT. Every MCP tool call verifies one, so it
 *                  must not cost a database round trip.
 * Refresh token -- opaque random string; only its SHA-256 lands in the database.
 *
 * Both are signed/hashed with primitives already in the app: jose via
 * src/lib/jwt.ts, and node:crypto. No new dependency.
 */
import { createHash, randomBytes } from 'crypto';
import { createToken, verifyToken } from '@/lib/jwt';
import {
    ACCESS_TOKEN_TTL_SECONDS,
    issuerUrl,
    resourceUrl,
} from './config';

/**
 * Marks a JWT as an MCP access token.
 *
 * MAGIC_LINK_SECRET signs magic-link tokens too. Without a type claim checked on
 * the way back in, a magic-link token would verify cleanly here and authenticate
 * an MCP session -- so this claim is load-bearing, not decoration.
 */
const TOKEN_TYPE = 'mcp_access';

export interface McpAccessTokenClaims {
    typ: typeof TOKEN_TYPE;
    sub: string;
    email: string;
    roles: string[];
    scope: string;
    client_id: string;
    aud: string;
    iss: string;
}

export interface McpAuthInfo {
    email: string;
    roles: string[];
    scopes: string[];
    clientId: string;
}

export async function mintAccessToken(params: {
    email: string;
    roles: string[];
    scope: string;
    clientId: string;
    resource?: string;
}): Promise<{ token: string; expiresIn: number }> {
    const token = await createToken(
        {
            typ: TOKEN_TYPE,
            sub: params.email,
            email: params.email,
            roles: params.roles,
            scope: params.scope,
            client_id: params.clientId,
            aud: params.resource || resourceUrl(),
            iss: issuerUrl(),
        },
        `${ACCESS_TOKEN_TTL_SECONDS}s`
    );

    return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

/**
 * Verify a bearer token and return who is calling.
 *
 * Returns null for anything not usable -- bad signature, expired, wrong type,
 * wrong audience. Callers turn that into a 401 challenge; no reason is reported
 * to the client beyond the challenge itself.
 */
export async function verifyAccessToken(token: string): Promise<McpAuthInfo | null> {
    try {
        const claims = await verifyToken<McpAccessTokenClaims>(token);

        if (claims.typ !== TOKEN_TYPE) return null;
        if (!claims.email) return null;

        // Audience binding (RFC 8707): a token minted for some other resource
        // must not work here, even though the same key signed it.
        if (claims.aud && claims.aud !== resourceUrl()) return null;

        return {
            email: claims.email,
            roles: Array.isArray(claims.roles) ? claims.roles : [],
            scopes: (claims.scope || '').split(' ').filter(Boolean),
            clientId: claims.client_id || '',
        };
    } catch {
        return null;
    }
}

/** Opaque refresh token. 32 bytes of entropy, URL-safe. */
export function generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
}

/** What actually gets stored. Never persist the token itself. */
export function hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/** Authorization code. Same shape, different lifetime and table. */
export function generateAuthorizationCode(): string {
    return randomBytes(32).toString('base64url');
}

/** Client identifier handed back from dynamic registration. */
export function generateClientId(): string {
    return `mcp_${randomBytes(16).toString('hex')}`;
}

// ── The authorize request, carried across the consent screen ────────────────

const AUTHZ_REQUEST_TYPE = 'mcp_authz_request';

/** Validated authorize parameters, in flight between GET and the user's click. */
export interface AuthorizationRequest {
    client_id: string;
    redirect_uri: string;
    scope: string;
    state?: string;
    code_challenge: string;
    resource?: string;
}

/**
 * Sign the validated authorize request so the consent screen can hand it back
 * untampered.
 *
 * The alternative -- passing the raw parameters through the consent page as query
 * string and re-reading them on POST -- would let anyone who can get a user to
 * submit that form swap in their own redirect_uri after validation has already
 * passed. Signing pins every parameter to the ones this endpoint actually
 * checked. Two minutes is a consent screen's useful life.
 */
export async function mintAuthorizationRequest(req: AuthorizationRequest): Promise<string> {
    return createToken({ typ: AUTHZ_REQUEST_TYPE, ...req }, '2m');
}

export async function verifyAuthorizationRequest(
    token: string
): Promise<AuthorizationRequest | null> {
    try {
        const claims = await verifyToken<AuthorizationRequest & { typ: string }>(token);
        if (claims.typ !== AUTHZ_REQUEST_TYPE) return null;
        if (!claims.client_id || !claims.redirect_uri || !claims.code_challenge) return null;

        return {
            client_id: claims.client_id,
            redirect_uri: claims.redirect_uri,
            scope: claims.scope,
            state: claims.state,
            code_challenge: claims.code_challenge,
            resource: claims.resource,
        };
    } catch {
        return null;
    }
}
