/**
 * Google service-account auth with domain-wide delegation.
 *
 * Why a service account and not the 3-legged OAuth this repo used to have for
 * Calendar: documents are created by a background job when a launch is created,
 * with no user present to consent. Per-user OAuth would turn "created on launch
 * create" into "created when someone happens to click".
 *
 * Why hand-rolled and not `googleapis`: the JWT flow is ~30 lines with `jose`,
 * which is already a dependency (Aha portal SSO, impersonation cookies). Adding
 * the full googleapis client for two REST calls is not worth the install size,
 * and the repo's convention is raw fetch against external APIs anyway.
 *
 * THREE SUPPORTED SETUPS, tried in this order:
 *
 *   0. OAuth connection (src/lib/google/oauth.ts) — an admin authorises once in
 *      Admin > Settings > Integrations > Google and ClearGO acts as that
 *      account. Preferred when present: it needs no Workspace admin, no
 *      shared-drive membership, and any admin can reconnect it later.
 *
 * The two below use a service account instead, and both need a GCP project with
 * the Drive and Docs APIs enabled plus a service-account JSON key.
 *
 *   A. Domain-wide delegation (needs a Workspace super-admin). Authorise the
 *      service account's numeric client ID for both scopes below, then set
 *      GOOGLE_IMPERSONATE_SUBJECT. Documents are created AS that person, so
 *      they are owned by a real identity and survive the service account being
 *      rotated.
 *
 *   B. Shared-drive membership (no admin ticket). Add the service account's
 *      client_email to a shared drive as a Content Manager and leave
 *      GOOGLE_IMPERSONATE_SUBJECT unset. Files are owned by the shared drive.
 *      This does NOT work for folders in someone's My Drive — a service account
 *      cannot be granted access to those — so the templates must be copied into
 *      the shared drive first.
 *
 * Note on scopes: drive.file is NOT sufficient. It grants access only to files
 * the app itself created, and the doc factory must READ templates it did not
 * create in order to copy them.
 */
// `jose` is imported dynamically inside getGoogleAccessToken() rather than
// statically, for the same reason src/lib/story-brief/generator.ts defers the
// AI SDK: its browser build is ESM, jsdom does not transform it, and the pure
// config helpers below must stay unit-testable without dragging it in.

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

export const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents',
] as const;

/**
 * Refresh this many milliseconds before the token actually expires. Matches the
 * 5-minute skew the Rovo client uses (src/lib/rovo/client.ts) — the deleted
 * Calendar code refreshed only after real expiry, which races.
 */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

export interface GoogleCredentials {
    clientEmail: string;
    privateKey: string;
    /**
     * The Workspace identity to impersonate (setup A), or null to act as the
     * service account itself (setup B). Optional on purpose: requiring it would
     * force a domain-wide-delegation admin request before anything could be
     * tried at all.
     */
    subject: string | null;
}

/**
 * Reads credentials from the environment. Returns null rather than throwing so
 * every caller can degrade to "Google not configured" instead of 500-ing — the
 * app must stay fully usable before the Workspace setup lands.
 */
export function getGoogleCredentials(): GoogleCredentials | null {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const subject = process.env.GOOGLE_IMPERSONATE_SUBJECT;

    // The subject is deliberately NOT required — see setup B above.
    if (!clientEmail || !rawKey) return null;

    return {
        clientEmail,
        // Env vars cannot hold real newlines in most hosts, so the key is stored
        // with literal \n sequences and unescaped here.
        privateKey: rawKey.replace(/\\n/g, '\n'),
        subject: subject?.trim() || null,
    };
}

/**
 * True when Drive/Docs calls can be attempted at all, by EITHER route.
 *
 * Async because the OAuth connection lives in the database. The synchronous
 * service-account-only check is kept below for callers that cannot await.
 */
export async function isGoogleConfigured(): Promise<boolean> {
    if (getGoogleCredentials() !== null) return true;
    try {
        const { isOAuthConnected } = await import('./oauth');
        return await isOAuthConnected();
    } catch {
        return false;
    }
}

/** Service-account credentials only — no database read. */
export function hasServiceAccountCredentials(): boolean {
    return getGoogleCredentials() !== null;
}

interface CachedToken {
    token: string;
    expiresAtMs: number;
}

/**
 * Module-level cache. Access tokens last an hour and are identical for every
 * caller, so minting one per request would be pure waste. Keyed by subject so
 * impersonating a second identity later does not silently reuse the first's
 * token.
 */
const tokenCache = new Map<string, CachedToken>();

/** Test seam — cached tokens outlive a test otherwise. */
export function clearGoogleTokenCache(): void {
    tokenCache.clear();
}

/**
 * Mint (or reuse) an access token for the impersonated identity.
 *
 * Throws when credentials are absent: callers that must tolerate an
 * unconfigured Google should check isGoogleConfigured() first. This is
 * deliberate — a silent null here would surface as a confusing 401 from Drive.
 */
export async function getGoogleAccessToken(): Promise<string> {
    // The OAuth connection wins when present: it is the one an admin can see,
    // reconnect and revoke from the settings page, so it should never be
    // silently shadowed by a service account left in the environment.
    try {
        const { getOAuthAccessToken } = await import('./oauth');
        const oauthToken = await getOAuthAccessToken();
        if (oauthToken) return oauthToken;
    } catch (err) {
        // A broken OAuth connection is worth surfacing rather than silently
        // falling through to a service account that may have different access.
        if (!getGoogleCredentials()) throw err;
        console.warn('Google OAuth unavailable, falling back to the service account:', err);
    }

    const creds = getGoogleCredentials();
    if (!creds) {
        throw new Error(
            'Google is not connected. Connect it in Admin > Settings > Integrations > Google, ' +
            'or set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
        );
    }

    // Keyed by subject so switching identities never reuses the wrong token;
    // the service-account-only mode gets its own stable key.
    const cacheKey = creds.subject ?? '__service_account__';
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAtMs - EXPIRY_SKEW_MS > Date.now()) {
        return cached.token;
    }

    const { SignJWT, importPKCS8 } = await import('jose');
    const key = await importPKCS8(creds.privateKey, 'RS256');
    const assertion = await new SignJWT({
        scope: GOOGLE_SCOPES.join(' '),
        // The `sub` claim is what turns this into domain-wide delegation: Google
        // issues a token acting AS that user. Omitted entirely in setup B —
        // sending an empty or absent-but-present sub is rejected outright.
        ...(creds.subject ? { sub: creds.subject } : {}),
    })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(creds.clientEmail)
        .setAudience(TOKEN_ENDPOINT)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(key);

    const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion }),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Google token exchange failed (${res.status}): ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
        throw new Error('Google token exchange returned no access_token');
    }

    tokenCache.set(cacheKey, {
        token: data.access_token,
        expiresAtMs: Date.now() + (data.expires_in ?? 3600) * 1000,
    });

    return data.access_token;
}
