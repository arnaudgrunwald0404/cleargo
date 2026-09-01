/**
 * Token endpoint: authorization_code exchange and refresh_token rotation.
 *
 * Two properties this file exists to guarantee:
 *
 *   Single use. Both codes and refresh tokens are claimed with an atomic UPDATE
 *   in the store, not a read-then-write here, so two concurrent requests cannot
 *   both succeed.
 *
 *   Fresh authority. Roles are re-read from app_user on every exchange rather
 *   than carried over from the previous token. Someone whose access was reduced
 *   an hour ago must not keep the old roles for another thirty days of refreshes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import {
    consumeAuthorizationCode,
    consumeRefreshToken,
    pruneExpired,
    resolveActor,
    revokeTokensAfterCodeReplay,
    storeRefreshToken,
} from '@/lib/oauth/store';
import {
    generateRefreshToken,
    mintAccessToken,
} from '@/lib/oauth/tokens';
import { verifyChallenge } from '@/lib/oauth/pkce';
import { resourceUrl } from '@/lib/oauth/config';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
};

export async function OPTIONS() {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
}

function oauthError(error: string, description: string, status = 400): NextResponse {
    return NextResponse.json(
        { error, error_description: description },
        {
            status,
            headers: {
                ...CORS_HEADERS,
                // RFC 6749 s5.1: token responses must not be cached anywhere.
                'Cache-Control': 'no-store',
                Pragma: 'no-cache',
            },
        }
    );
}

function tokenResponse(body: Record<string, unknown>): NextResponse {
    return NextResponse.json(body, {
        headers: {
            ...CORS_HEADERS,
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
        },
    });
}

/**
 * Mint the pair and persist the refresh half.
 *
 * Shared by both grants so a change to lifetime or claims cannot apply to one
 * path and not the other.
 */
async function issueTokens(params: {
    clientId: string;
    email: string;
    roles: string[];
    scope: string;
    resource: string | null;
}): Promise<NextResponse> {
    const { token: accessToken, expiresIn } = await mintAccessToken({
        email: params.email,
        roles: params.roles,
        scope: params.scope,
        clientId: params.clientId,
        resource: params.resource ?? resourceUrl(),
    });

    const refreshToken = generateRefreshToken();
    await storeRefreshToken({
        token: refreshToken,
        clientId: params.clientId,
        userEmail: params.email,
        scope: params.scope,
        resource: params.resource,
    });

    return tokenResponse({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        refresh_token: refreshToken,
        scope: params.scope,
    });
}

async function grantAuthorizationCode(form: FormData): Promise<NextResponse> {
    const code = String(form.get('code') ?? '');
    const clientId = String(form.get('client_id') ?? '');
    const redirectUri = String(form.get('redirect_uri') ?? '');
    const codeVerifier = String(form.get('code_verifier') ?? '');

    if (!code || !clientId || !codeVerifier) {
        return oauthError(
            'invalid_request',
            'code, client_id and code_verifier are all required.'
        );
    }

    const record = await consumeAuthorizationCode(code);

    if (!record) {
        // Unknown, expired, or already spent. The last of those is a replay and
        // is worth acting on: anything issued from that authorization is suspect.
        await revokeTokensAfterCodeReplay(code);
        return oauthError('invalid_grant', 'Authorization code is invalid, expired, or already used.');
    }

    // A code issued to one client must not be redeemable by another.
    if (record.client_id !== clientId) {
        console.warn(
            `[oauth/token] code/client mismatch: issued to ${record.client_id}, presented by ${clientId}`
        );
        return oauthError('invalid_grant', 'Authorization code was not issued to this client.');
    }

    // RFC 6749 s4.1.3: when redirect_uri was in the authorize request it must be
    // repeated identically here.
    if (redirectUri && redirectUri !== record.redirect_uri) {
        return oauthError('invalid_grant', 'redirect_uri does not match the authorization request.');
    }

    if (!verifyChallenge(codeVerifier, record.code_challenge)) {
        return oauthError('invalid_grant', 'PKCE verification failed.');
    }

    const actor = await resolveActor(record.user_email);
    if (!actor) {
        return oauthError('invalid_grant', 'This account may no longer connect.', 403);
    }

    void pruneExpired();

    console.log(`[oauth/token] code exchange client=${clientId} user=${actor.email}`);

    return issueTokens({
        clientId,
        email: actor.email,
        roles: actor.roles,
        scope: record.scope,
        resource: record.resource,
    });
}

async function grantRefreshToken(form: FormData): Promise<NextResponse> {
    const refreshToken = String(form.get('refresh_token') ?? '');
    const clientId = String(form.get('client_id') ?? '');
    const requestedScope = String(form.get('scope') ?? '');

    if (!refreshToken) {
        return oauthError('invalid_request', 'refresh_token is required.');
    }

    const record = await consumeRefreshToken(refreshToken);
    if (!record) {
        return oauthError('invalid_grant', 'Refresh token is invalid, expired, or already used.');
    }

    if (clientId && record.client_id !== clientId) {
        return oauthError('invalid_grant', 'Refresh token was not issued to this client.');
    }

    const actor = await resolveActor(record.user_email);
    if (!actor) {
        return oauthError('invalid_grant', 'This account may no longer connect.', 403);
    }

    // A refresh may narrow scope but never widen it (RFC 6749 s6).
    const granted = record.scope.split(/\s+/).filter(Boolean);
    const scope = requestedScope
        ? requestedScope.split(/\s+/).filter((s) => granted.includes(s)).join(' ')
        : record.scope;

    if (!scope) {
        return oauthError('invalid_scope', 'Requested scope exceeds the original grant.');
    }

    return issueTokens({
        clientId: record.client_id,
        email: actor.email,
        roles: actor.roles,
        scope,
        resource: record.resource,
    });
}

async function handler(request: NextRequest): Promise<NextResponse> {
    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return oauthError('invalid_request', 'Body must be application/x-www-form-urlencoded.');
    }

    const grantType = String(form.get('grant_type') ?? '');

    switch (grantType) {
        case 'authorization_code':
            return grantAuthorizationCode(form);
        case 'refresh_token':
            return grantRefreshToken(form);
        default:
            return oauthError(
                'unsupported_grant_type',
                `Unsupported grant_type: ${grantType || '(missing)'}`
            );
    }
}

export const POST = withRateLimit(handler, RATE_LIMITS.default, (req) =>
    req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'anonymous'
);

export async function GET() {
    return oauthError('invalid_request', 'The token endpoint accepts POST only.', 405);
}
