/**
 * The remote MCP endpoint — an OAuth 2.0 resource server.
 *
 * Authentication is a bearer access token minted by this app's own authorization
 * server (src/app/api/oauth/*). The 401 below is not just a rejection: the
 * WWW-Authenticate header it carries is what tells Claude Desktop where the
 * protected-resource metadata lives, which is how a client that has never seen
 * this server discovers it needs to run an OAuth flow. Drop that header and the
 * connector fails with nothing useful to show the user.
 *
 * The legacy X-ClearGo-Key shared secret is still accepted for the older
 * team-management tools and any script built against them. It grants no identity
 * — a request authenticated that way has no roles, so every capability-gated tool
 * refuses it. Remove it once those callers move over.
 */
import { NextResponse } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createClearGoMcpServer } from '@/lib/mcp/server';
import { verifyAccessToken, type McpAuthInfo } from '@/lib/oauth/tokens';
import { protectedResourceMetadataUrl } from '@/lib/oauth/config';
import { createAdminSupabase } from '../../../../netlify/functions/_shared/supabase';
import { rateLimit, type RateLimitConfig } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Throttling, keyed on the authenticated caller.
 *
 * The usual withRateLimit wrapper is typed for NextRequest/NextResponse and this
 * is a plain Request handler, so it uses the same primitive directly.
 *
 * Keyed on email, not IP: a whole office behind one egress address would share an
 * IP bucket and throttle each other. It also means the legacy shared-key actor
 * shares one bucket, which is correct — it is one service credential.
 *
 * Deliberately the 100/min default rather than RATE_LIMITS.heavy: one Claude
 * Desktop turn can fan out into many tool calls, and 40/min would cut off normal
 * interactive use. It still bounds a runaway loop.
 */
const MCP_RATE_LIMIT: RateLimitConfig = { windowMs: 60_000, maxRequests: 100 };

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'Authorization, X-ClearGo-Key, Content-Type, mcp-session-id, MCP-Protocol-Version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Without this the browser-side client cannot read the challenge and never
    // learns where to authenticate.
    'Access-Control-Expose-Headers': 'WWW-Authenticate, mcp-session-id',
};

/**
 * Legacy shared-secret path.
 *
 * Returns an anonymous actor: authenticated enough to read, never enough to pass
 * a capability check. That is the point — it is a service credential, not a
 * person, and it should not be able to approve anyone's artifact.
 */
function legacyKeyActor(req: Request): McpAuthInfo | null {
    const envKey = process.env.CLEARGO_AI_API_KEY;
    if (!envKey) return null;
    if (req.headers.get('X-ClearGo-Key') !== envKey) return null;

    return {
        email: 'service@cleargo.local',
        roles: [],
        scopes: ['cleargo:read'],
        clientId: 'legacy-shared-key',
    };
}

async function authenticate(req: Request): Promise<McpAuthInfo | null> {
    const header = req.headers.get('authorization');
    if (header?.startsWith('Bearer ')) {
        const info = await verifyAccessToken(header.slice(7).trim());
        if (info) return info;
    }

    return legacyKeyActor(req);
}

function unauthorized(): NextResponse {
    return NextResponse.json(
        { error: 'Unauthorized' },
        {
            status: 401,
            headers: {
                ...CORS_HEADERS,
                'WWW-Authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`,
            },
        }
    );
}

export async function OPTIONS() {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
    const auth = await authenticate(req);
    if (!auth) return unauthorized();

    const limit = rateLimit(`mcp:${auth.email}`, MCP_RATE_LIMIT);
    const limitHeaders = {
        'X-RateLimit-Limit': String(MCP_RATE_LIMIT.maxRequests),
        'X-RateLimit-Remaining': String(limit.remaining),
        'X-RateLimit-Reset': new Date(limit.resetTime).toISOString(),
    };

    if (!limit.allowed) {
        return NextResponse.json(
            {
                error: 'Too Many Requests',
                message: 'Rate limit exceeded. Please try again shortly.',
                retryAfter: Math.ceil((limit.resetTime - Date.now()) / 1000),
            },
            { status: 429, headers: { ...CORS_HEADERS, ...limitHeaders } }
        );
    }

    try {
        const supabase = createAdminSupabase();
        const mcpServer = createClearGoMcpServer(supabase, auth);

        // JSON response mode, not SSE. In SSE mode handleRequest returns as soon
        // as the stream exists and the JSON-RPC result is written into it later,
        // so the mcpServer.close() below races that write and wins — the client
        // gets a 200 text/event-stream with an empty body, and every handshake
        // fails with no error to show. In JSON mode handleRequest resolves only
        // once every response is ready, which is also the right shape for a
        // stateless serverless function that cannot hold a stream open anyway.
        const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });

        await mcpServer.connect(transport);

        const body = await req.json();
        const response = await transport.handleRequest(req, { parsedBody: body });

        await mcpServer.close();

        const headers = new Headers(response.headers);
        for (const [k, v] of Object.entries({ ...CORS_HEADERS, ...limitHeaders })) {
            headers.set(k, v);
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch (err) {
        console.error('[mcp route] error:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: CORS_HEADERS }
        );
    }
}
