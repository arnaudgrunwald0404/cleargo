/**
 * Token revocation (RFC 7009).
 *
 * Only refresh tokens can actually be revoked. Access tokens are stateless JWTs
 * with no server-side record, so there is nothing to mark — they simply stop
 * working when they expire, within the hour. Revoking the refresh token is what
 * ends the connection: the client cannot mint another access token after that.
 *
 * RFC 7009 s2.2 requires 200 for an unknown or already-revoked token, so that a
 * caller cannot use this endpoint to test whether a token string is real.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { revokeRefreshToken } from '@/lib/oauth/store';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
};

export async function OPTIONS() {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
}

async function handler(request: NextRequest): Promise<NextResponse> {
    const form = await request.formData().catch(() => null);
    const token = form ? String(form.get('token') ?? '') : '';

    if (token) {
        try {
            await revokeRefreshToken(token);
        } catch (err) {
            // Still a 200 below. A revocation the caller believes succeeded but
            // that failed server-side is bad, so it is logged loudly, but leaking
            // the failure back would also leak token validity.
            console.error('[oauth/revoke] failed:', err);
        }
    }

    return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export const POST = withRateLimit(handler, RATE_LIMITS.default, (req) =>
    req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'anonymous'
);
