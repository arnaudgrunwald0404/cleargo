/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for the MCP endpoint.
 *
 * This is the first thing a client fetches after /api/mcp answers 401, and the
 * only thing that tells it where to go and authenticate. The path is not
 * arbitrary: RFC 9728 appends the resource's path to the well-known prefix, so
 * the metadata for `/api/mcp` must be served from
 * `/.well-known/oauth-protected-resource/api/mcp`. That is why this file sits
 * three folders deep -- it mirrors the resource URL, and the 401 challenge in
 * src/app/api/mcp/route.ts points here by the same construction.
 *
 * Unauthenticated by design; discovery documents are public.
 */
import { NextResponse } from 'next/server';
import {
    protectedResourceMetadataUrl,
    issuerUrl,
    resourceUrl,
    SUPPORTED_SCOPES,
} from '@/lib/oauth/config';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version',
};

export async function OPTIONS() {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET() {
    return NextResponse.json(
        {
            resource: resourceUrl(),
            authorization_servers: [issuerUrl()],
            scopes_supported: SUPPORTED_SCOPES,
            bearer_methods_supported: ['header'],
            resource_name: 'ClearGO Launch Readiness',
        },
        {
            headers: {
                ...CORS_HEADERS,
                // Short: the document is stable, but a wrong cached copy during a
                // hostname change is painful to debug from the client side.
                'Cache-Control': 'public, max-age=300',
                'X-Resource-Metadata-Url': protectedResourceMetadataUrl(),
            },
        }
    );
}
