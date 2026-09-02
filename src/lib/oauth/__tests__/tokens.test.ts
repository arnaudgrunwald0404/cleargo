/**
 * @jest-environment node
 *
 * Node rather than the default jsdom: under jsdom, jose resolves to its
 * browser ESM build, which Jest's CJS transform cannot load. These tests sign
 * and verify real tokens, so the jwt module cannot be mocked away here.
 *
 * Access tokens are stateless, so verifyAccessToken is the only thing standing
 * between a signed string and a session on the MCP endpoint.
 *
 * The case worth writing down: MAGIC_LINK_SECRET signs the app's magic-link
 * tokens too. Without the `typ` claim being checked, a magic-link token would
 * verify cleanly and authenticate an MCP session with whatever claims it carried.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createToken } from '@/lib/jwt';
import { mintAccessToken, verifyAccessToken, hashRefreshToken, generateRefreshToken } from '../tokens';

const ORIGINAL = {
    MAGIC_LINK_SECRET: process.env.MAGIC_LINK_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

beforeAll(() => {
    process.env.MAGIC_LINK_SECRET = 'test-secret-for-oauth-token-tests';
    process.env.NEXT_PUBLIC_APP_URL = 'https://cleargo.test';
});

afterAll(() => {
    for (const [k, v] of Object.entries(ORIGINAL)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
});

const ACTOR = {
    email: 'pm@clearcompany.com',
    roles: ['PMM'],
    scope: 'cleargo:read cleargo:write',
    clientId: 'mcp_abc123',
};

describe('mintAccessToken / verifyAccessToken', () => {
    it('round-trips the actor, roles, and scopes', async () => {
        const { token, expiresIn } = await mintAccessToken(ACTOR);
        const info = await verifyAccessToken(token);

        expect(expiresIn).toBe(3600);
        expect(info).toEqual({
            email: 'pm@clearcompany.com',
            roles: ['PMM'],
            scopes: ['cleargo:read', 'cleargo:write'],
            clientId: 'mcp_abc123',
        });
    });

    it('rejects a magic-link token signed with the same secret', async () => {
        // Shape of a real magic-link token: same key, no `typ` claim.
        const magicLink = await createToken({ email: 'pm@clearcompany.com' }, '1h');

        expect(await verifyAccessToken(magicLink)).toBeNull();
    });

    it('rejects a token minted for a different resource', async () => {
        const { token } = await mintAccessToken({
            ...ACTOR,
            resource: 'https://someone-elses-server.example/api/mcp',
        });

        expect(await verifyAccessToken(token)).toBeNull();
    });

    it('rejects a tampered signature', async () => {
        const { token } = await mintAccessToken(ACTOR);
        const [header, payload] = token.split('.');

        expect(await verifyAccessToken(`${header}.${payload}.not-the-signature`)).toBeNull();
    });

    it('rejects an expired token', async () => {
        const expired = await createToken(
            { typ: 'mcp_access', email: 'pm@clearcompany.com', roles: [], scope: '', aud: 'https://cleargo.test/api/mcp' },
            Math.floor(Date.now() / 1000) - 60
        );

        expect(await verifyAccessToken(expired)).toBeNull();
    });

    it('rejects garbage', async () => {
        expect(await verifyAccessToken('')).toBeNull();
        expect(await verifyAccessToken('not.a.jwt')).toBeNull();
    });
});

describe('refresh tokens', () => {
    it('hashes deterministically, and never stores the token itself', () => {
        const token = generateRefreshToken();
        const hash = hashRefreshToken(token);

        expect(hash).toBe(hashRefreshToken(token));
        expect(hash).not.toContain(token);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates distinct tokens', () => {
        const tokens = new Set(Array.from({ length: 50 }, generateRefreshToken));
        expect(tokens.size).toBe(50);
    });
});
