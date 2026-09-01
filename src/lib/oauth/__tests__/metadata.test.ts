/**
 * @jest-environment node
 *
 * The two discovery documents, validated against the MCP SDK's own schemas.
 *
 * These are the first two requests a client makes, and a malformed field fails
 * in the least helpful way available: the connector reports only that it could
 * not connect, with no indication of which document or which key was wrong. The
 * SDK ships the Zod schemas its client validates against, so checking our
 * responses against them here is as close to testing the real handshake as it is
 * possible to get without a browser.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
    OAuthMetadataSchema,
    OAuthProtectedResourceMetadataSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { GET as getProtectedResource } from '@/app/.well-known/oauth-protected-resource/api/mcp/route';
import { GET as getAuthorizationServer } from '@/app/.well-known/oauth-authorization-server/route';
import { protectedResourceMetadataUrl, resourceUrl } from '../config';

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;

beforeAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://cleargo.test';
});

afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe('protected resource metadata', () => {
    it('validates against the SDK schema', async () => {
        const body = await (await getProtectedResource()).json();

        const parsed = OAuthProtectedResourceMetadataSchema.safeParse(body);
        expect(parsed.error?.issues ?? []).toEqual([]);
        expect(parsed.success).toBe(true);
    });

    it('names the MCP endpoint as the resource and this app as the authorization server', async () => {
        const body = await (await getProtectedResource()).json();

        expect(body.resource).toBe('https://cleargo.test/api/mcp');
        expect(body.authorization_servers).toEqual(['https://cleargo.test']);
    });
});

describe('authorization server metadata', () => {
    it('validates against the SDK schema', async () => {
        const body = await (await getAuthorizationServer()).json();

        const parsed = OAuthMetadataSchema.safeParse(body);
        expect(parsed.error?.issues ?? []).toEqual([]);
        expect(parsed.success).toBe(true);
    });

    it('advertises dynamic client registration', async () => {
        // Without this key a teammate has to paste a client ID and secret by
        // hand, which is the entire thing this design exists to avoid.
        const body = await (await getAuthorizationServer()).json();

        expect(body.registration_endpoint).toBe('https://cleargo.test/api/oauth/register');
    });

    it('offers S256 and refuses to advertise plain', async () => {
        const body = await (await getAuthorizationServer()).json();

        expect(body.code_challenge_methods_supported).toEqual(['S256']);
    });

    it('declares public clients only', async () => {
        const body = await (await getAuthorizationServer()).json();

        expect(body.token_endpoint_auth_methods_supported).toEqual(['none']);
    });
});

describe('the 401 challenge and the metadata route agree', () => {
    it('points at a path that RFC 9728 puts the resource path under', async () => {
        // The route file lives at
        // app/.well-known/oauth-protected-resource/api/mcp/route.ts. If the
        // challenge URL and that path ever diverge, discovery 404s and the
        // connector fails with nothing to go on.
        expect(protectedResourceMetadataUrl()).toBe(
            'https://cleargo.test/.well-known/oauth-protected-resource/api/mcp'
        );
        expect(resourceUrl()).toBe('https://cleargo.test/api/mcp');
    });
});
