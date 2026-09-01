/**
 * Authorization endpoint (OAuth 2.1 authorization code + PKCE).
 *
 * Split across two methods on purpose:
 *
 *   GET  validates the request, makes sure a real ClearGO user is driving it, and
 *        hands a signed copy of the validated parameters to the consent screen.
 *   POST takes that signed request back plus the user's decision and issues the
 *        authorization code.
 *
 * The consent screen is not ceremony. Registration is dynamic and open, so any
 * client can obtain a client_id; the only thing standing between a registered
 * client and a user's data is the user looking at a page that names the client
 * and clicking Allow. That click is the actual authorization decision.
 *
 * Error handling follows RFC 6749 s4.1.2.1: problems with client_id or
 * redirect_uri are shown to the *user*, because redirecting to an unvalidated URI
 * is how an open redirector is built. Everything else redirects back to the
 * client with an `error` parameter.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import {
    getClient,
    isRedirectUriRegistered,
    createAuthorizationCode,
    resolveActor,
} from '@/lib/oauth/store';
import {
    generateAuthorizationCode,
    mintAuthorizationRequest,
    verifyAuthorizationRequest,
} from '@/lib/oauth/tokens';
import { DEFAULT_SCOPE, SUPPORTED_SCOPES, baseUrl, resourceUrl } from '@/lib/oauth/config';

export const dynamic = 'force-dynamic';

/** Shown to the user; never redirected to an unvalidated URI. */
function userFacingError(message: string): NextResponse {
    const url = new URL('/oauth/error', baseUrl());
    url.searchParams.set('message', message);
    return NextResponse.redirect(url, { status: 303 });
}

/** Sent back to the client, per RFC 6749. */
function redirectError(
    redirectUri: string,
    error: string,
    description: string,
    state?: string
): NextResponse {
    const url = new URL(redirectUri);
    url.searchParams.set('error', error);
    url.searchParams.set('error_description', description);
    if (state) url.searchParams.set('state', state);
    return NextResponse.redirect(url, { status: 303 });
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
    const params = request.nextUrl.searchParams;

    const clientId = params.get('client_id');
    const redirectUri = params.get('redirect_uri');
    const responseType = params.get('response_type');
    const codeChallenge = params.get('code_challenge');
    const codeChallengeMethod = params.get('code_challenge_method');
    const state = params.get('state') ?? undefined;
    const resource = params.get('resource') ?? undefined;
    const requestedScope = params.get('scope');

    // ── Client and redirect URI: errors here are shown, never redirected ────
    if (!clientId) return userFacingError('Missing client_id.');

    const client = await getClient(clientId);
    if (!client) return userFacingError('Unknown client. Try removing and re-adding the connector.');

    if (!redirectUri) return userFacingError('Missing redirect_uri.');
    if (!isRedirectUriRegistered(client, redirectUri)) {
        return userFacingError('redirect_uri does not match this client’s registration.');
    }

    // ── Everything below can safely redirect ────────────────────────────────
    if (responseType !== 'code') {
        return redirectError(redirectUri, 'unsupported_response_type', 'Only "code" is supported.', state);
    }

    if (!codeChallenge) {
        return redirectError(redirectUri, 'invalid_request', 'PKCE code_challenge is required.', state);
    }

    if (codeChallengeMethod !== 'S256') {
        return redirectError(
            redirectUri,
            'invalid_request',
            'code_challenge_method must be S256.',
            state
        );
    }

    // Unknown scopes are dropped rather than refused: a client asking for more
    // than exists should still get a working connection with what it can have.
    const scope = requestedScope
        ? requestedScope.split(/\s+/).filter((s) => SUPPORTED_SCOPES.includes(s)).join(' ')
        : DEFAULT_SCOPE;

    if (!scope) {
        return redirectError(redirectUri, 'invalid_scope', 'No supported scopes requested.', state);
    }

    // ── Who is doing this? ──────────────────────────────────────────────────
    const email = await getAuthenticatedUserEmail();
    if (!email) {
        // Back here after login, with every parameter intact.
        const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
        const loginUrl = new URL('/login', baseUrl());
        loginUrl.searchParams.set('redirect', returnTo);
        return NextResponse.redirect(loginUrl, { status: 303 });
    }

    const actor = await resolveActor(email);
    if (!actor) {
        return userFacingError(
            `${email} is not permitted to connect. Ask an admin to allowlist your email domain.`
        );
    }

    const authzRequest = await mintAuthorizationRequest({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state,
        code_challenge: codeChallenge,
        resource: resource ?? resourceUrl(),
    });

    const consentUrl = new URL('/oauth/consent', baseUrl());
    consentUrl.searchParams.set('request', authzRequest);
    consentUrl.searchParams.set('client_name', client.client_name || 'An application');
    return NextResponse.redirect(consentUrl, { status: 303 });
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
    const form = await request.formData().catch(() => null);
    if (!form) {
        return userFacingError('Malformed consent submission.');
    }

    const requestToken = String(form.get('request') ?? '');
    const decision = String(form.get('decision') ?? '');

    const authzRequest = await verifyAuthorizationRequest(requestToken);
    if (!authzRequest) {
        return userFacingError('This authorization request expired. Start the connection again.');
    }

    // Re-check the session rather than trusting the signed request: the token
    // says which request was approved, not who is approving it now.
    const email = await getAuthenticatedUserEmail();
    if (!email) {
        return userFacingError('Your session ended. Sign in and try again.');
    }

    const actor = await resolveActor(email);
    if (!actor) {
        return userFacingError(`${email} is not permitted to connect.`);
    }

    if (decision !== 'allow') {
        return redirectError(
            authzRequest.redirect_uri,
            'access_denied',
            'The user declined the request.',
            authzRequest.state
        );
    }

    const code = generateAuthorizationCode();
    try {
        await createAuthorizationCode({
            code,
            clientId: authzRequest.client_id,
            userEmail: actor.email,
            redirectUri: authzRequest.redirect_uri,
            scope: authzRequest.scope,
            codeChallenge: authzRequest.code_challenge,
            resource: authzRequest.resource,
        });
    } catch (err) {
        console.error('[oauth/authorize] could not store code:', err);
        return redirectError(
            authzRequest.redirect_uri,
            'server_error',
            'Could not complete authorization.',
            authzRequest.state
        );
    }

    console.log(
        `[oauth/authorize] granted client=${authzRequest.client_id} user=${actor.email} scope="${authzRequest.scope}"`
    );

    const redirect = new URL(authzRequest.redirect_uri);
    redirect.searchParams.set('code', code);
    if (authzRequest.state) redirect.searchParams.set('state', authzRequest.state);
    return NextResponse.redirect(redirect, { status: 303 });
}

export const GET = withRateLimit(handleGet, RATE_LIMITS.default);
export const POST = withRateLimit(handlePost, RATE_LIMITS.default);
