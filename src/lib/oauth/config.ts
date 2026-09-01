/**
 * Identifiers and lifetimes for the MCP OAuth server.
 *
 * Everything here derives from one base URL, because OAuth discovery is
 * unforgiving about mismatches: the issuer a client reads from the metadata
 * document has to be byte-identical to the issuer it later validates, and the
 * resource the token is bound to has to match the URL the client is calling.
 * Computing them all from a single source removes the class of bug where a
 * trailing slash or a preview-deploy hostname silently breaks the handshake.
 */

/** Base URL of this deployment, without a trailing slash. */
export function baseUrl(): string {
    const raw =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NETLIFY_URL ||
        process.env.URL ||
        'http://localhost:3000';
    return raw.replace(/\/+$/, '');
}

/** OAuth issuer identifier. The AS and the app are the same origin. */
export function issuerUrl(): string {
    return baseUrl();
}

/** The protected resource clients are getting a token for: the MCP endpoint. */
export function resourceUrl(): string {
    return `${baseUrl()}/api/mcp`;
}

/**
 * Where the 401 challenge points.
 *
 * RFC 9728 puts the resource path AFTER the well-known segment, so the metadata
 * for `/api/mcp` lives at `/.well-known/oauth-protected-resource/api/mcp`. This
 * mirrors the SDK's getOAuthProtectedResourceMetadataUrl(); the route file tree
 * has to match it exactly or discovery 404s.
 */
export function protectedResourceMetadataUrl(): string {
    return `${baseUrl()}/.well-known/oauth-protected-resource/api/mcp`;
}

export const OAUTH_ENDPOINTS = {
    authorize: '/api/oauth/authorize',
    token: '/api/oauth/token',
    register: '/api/oauth/register',
    revoke: '/api/oauth/revoke',
} as const;

/**
 * Scopes.
 *
 * Kept coarse on purpose. Fine-grained authorization already exists as ClearGO
 * capabilities checked per tool against the user's roles (src/lib/permissions.ts),
 * and duplicating that vocabulary in scopes would create two systems that have to
 * agree. A scope says which half of the surface a token may touch; the user's
 * roles still decide whether any particular write is allowed.
 */
export const SCOPES = {
    read: 'cleargo:read',
    write: 'cleargo:write',
} as const;

/** Widened to string[] so callers can test arbitrary requested scopes against it. */
export const SUPPORTED_SCOPES: string[] = [SCOPES.read, SCOPES.write];
export const DEFAULT_SCOPE = `${SCOPES.read} ${SCOPES.write}`;

/** Authorization codes are exchanged within seconds; a minute is generous. */
export const AUTHORIZATION_CODE_TTL_SECONDS = 60;

/**
 * Access tokens are not stored, so this window is also the worst-case delay
 * between revoking a connection and it actually going dead.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

/** Refresh tokens rotate on every use; this is the idle ceiling. */
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
