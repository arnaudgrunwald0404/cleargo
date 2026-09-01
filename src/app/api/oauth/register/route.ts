/**
 * Dynamic Client Registration (RFC 7591).
 *
 * This endpoint is the whole reason a teammate can add the connector with just a
 * URL: Claude Desktop POSTs its own metadata here, gets a client_id back, and
 * runs the flow. Nobody pastes anything.
 *
 * It is necessarily unauthenticated -- a client has no credential before it
 * registers -- so it is treated as a hostile input surface: schema-validated,
 * rate limited by IP, and everything it stores is inert until a *user* completes
 * an authorize request for it. Registering a client grants no access on its own.
 */
import { NextRequest, NextResponse } from 'next/server';
import { OAuthClientMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import { withRateLimit } from '@/lib/middleware/rate-limit-middleware';
import { createClient as storeClient } from '@/lib/oauth/store';
import { generateClientId } from '@/lib/oauth/tokens';
import { DEFAULT_SCOPE } from '@/lib/oauth/config';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version',
};

export async function OPTIONS() {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
}

/**
 * Registration is cheap but unauthenticated, so cap it hard by IP. A client
 * registers once per install; anything registering in bulk is not a teammate.
 */
const REGISTER_RATE_LIMIT = { windowMs: 60_000, maxRequests: 10 };

async function handler(request: NextRequest): Promise<NextResponse> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'invalid_client_metadata', error_description: 'Body must be JSON.' },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    const parsed = OAuthClientMetadataSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            {
                error: 'invalid_client_metadata',
                error_description: parsed.error.issues
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join('; '),
            },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    const metadata = parsed.data;

    // The SDK schema already rejects javascript: and other unsafe schemes via its
    // SafeUrlSchema, but http:// to a non-loopback host is still a downgrade we
    // should not hand a token to.
    for (const uri of metadata.redirect_uris) {
        let parsedUri: URL;
        try {
            parsedUri = new URL(uri);
        } catch {
            return NextResponse.json(
                { error: 'invalid_redirect_uri', error_description: `Not a URL: ${uri}` },
                { status: 400, headers: CORS_HEADERS }
            );
        }

        const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedUri.hostname);
        const isPrivateScheme = !parsedUri.protocol.startsWith('http');

        if (parsedUri.protocol === 'http:' && !isLoopback) {
            return NextResponse.json(
                {
                    error: 'invalid_redirect_uri',
                    error_description: `Redirect URIs must use https (or http on loopback): ${uri}`,
                },
                { status: 400, headers: CORS_HEADERS }
            );
        }

        // A custom scheme (claude://…) is how a desktop client receives the
        // callback; allowed, and noted here so the check above is not read as
        // https-only.
        void isPrivateScheme;
    }

    const clientId = generateClientId();

    try {
        await storeClient({
            clientId,
            clientName: metadata.client_name,
            redirectUris: metadata.redirect_uris,
            scope: metadata.scope ?? DEFAULT_SCOPE,
            // Public client, always. See the AS metadata document for why: an
            // installed application cannot keep a secret, so PKCE carries the
            // security rather than a credential we would be pretending is private.
            tokenEndpointAuthMethod: 'none',
            metadata: metadata as unknown as Record<string, unknown>,
        });
    } catch (err) {
        console.error('[oauth/register] failed:', err);
        return NextResponse.json(
            { error: 'server_error', error_description: 'Could not register client.' },
            { status: 500, headers: CORS_HEADERS }
        );
    }

    console.log(
        `[oauth/register] client_id=${clientId} name=${metadata.client_name ?? '(unnamed)'}`
    );

    return NextResponse.json(
        {
            client_id: clientId,
            client_id_issued_at: Math.floor(Date.now() / 1000),
            redirect_uris: metadata.redirect_uris,
            client_name: metadata.client_name,
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            scope: metadata.scope ?? DEFAULT_SCOPE,
        },
        { status: 201, headers: CORS_HEADERS }
    );
}

export const POST = withRateLimit(handler, REGISTER_RATE_LIMIT, (req) =>
    req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'anonymous'
);
