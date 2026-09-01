/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * Read after the protected-resource document points here. Everything a client
 * needs to run the flow without being told anything by a human is in this
 * response -- crucially `registration_endpoint`, which is what lets Claude
 * Desktop register itself and is the reason nobody on the team has to paste a
 * client ID or secret.
 *
 * Unauthenticated by design; discovery documents are public.
 */
import { NextResponse } from 'next/server';
import { issuerUrl, OAUTH_ENDPOINTS, SUPPORTED_SCOPES } from '@/lib/oauth/config';

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
    const issuer = issuerUrl();

    return NextResponse.json(
        {
            issuer,
            authorization_endpoint: `${issuer}${OAUTH_ENDPOINTS.authorize}`,
            token_endpoint: `${issuer}${OAUTH_ENDPOINTS.token}`,
            registration_endpoint: `${issuer}${OAUTH_ENDPOINTS.register}`,
            revocation_endpoint: `${issuer}${OAUTH_ENDPOINTS.revoke}`,

            scopes_supported: SUPPORTED_SCOPES,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],

            // S256 only. Advertising 'plain' here would invite clients to use it,
            // and the authorize endpoint rejects it anyway.
            code_challenge_methods_supported: ['S256'],

            // Registered clients are public clients holding no secret -- Claude
            // Desktop is an installed application, so a shipped secret would not
            // be one. PKCE is what protects the exchange instead.
            token_endpoint_auth_methods_supported: ['none'],

            revocation_endpoint_auth_methods_supported: ['none'],
        },
        {
            headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=300' },
        }
    );
}
