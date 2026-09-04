/**
 * @jest-environment node
 *
 * The node environment, not the project-wide jsdom default: this exercises a
 * real MCP transport over web-standard Request/Response, which jsdom does not
 * provide faithfully.
 *
 * POST /api/mcp must return a body.
 *
 * It did not. The transport defaults to SSE, where handleRequest returns as
 * soon as the stream exists and the JSON-RPC result is written into it a tick
 * later. The route closed the server immediately afterwards, which tore down
 * the stream controller before that write landed — so every client got a 200
 * text/event-stream with an empty body and no `initialize` result. The
 * handshake failed for every client, every time, with nothing in the logs.
 *
 * These tests are about the envelope, not the tool payloads: a response that
 * actually carries the JSON-RPC result by the time the route hands it back.
 */
const mockVerifyAccessToken = jest.fn();

jest.mock('@/lib/oauth/tokens', () => ({
    verifyAccessToken: (t: string) => mockVerifyAccessToken(t),
}));

jest.mock('../../../../../netlify/functions/_shared/supabase', () => ({
    createAdminSupabase: () => ({}),
}));

import { POST } from '../route';

const ACTOR = {
    email: 'pm@example.com',
    roles: ['PM'],
    scopes: ['cleargo:read', 'cleargo:write'],
    clientId: 'test-client',
};

function initializeRequest(headers: Record<string, string> = {}): Request {
    return new Request('https://cleargo.test/api/mcp', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            authorization: 'Bearer token',
            ...headers,
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'test', version: '1.0.0' },
            },
        }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAccessToken.mockResolvedValue(ACTOR);
});

describe('POST /api/mcp', () => {
    it('returns a non-empty body for initialize', async () => {
        const res = await POST(initializeRequest());
        const text = await res.text();

        expect(res.status).toBe(200);
        expect(text.trim()).not.toBe('');
    });

    it('completes the handshake with a JSON-RPC result', async () => {
        const res = await POST(initializeRequest());
        const payload = JSON.parse(await res.text());

        expect(payload.jsonrpc).toBe('2.0');
        expect(payload.id).toBe(1);
        expect(payload.error).toBeUndefined();
        expect(payload.result.serverInfo.name).toBe('cleargo');
        expect(payload.result.protocolVersion).toBeTruthy();
    });

    it('challenges an unauthenticated request', async () => {
        mockVerifyAccessToken.mockResolvedValue(null);

        const res = await POST(initializeRequest());

        expect(res.status).toBe(401);
        expect(res.headers.get('WWW-Authenticate')).toContain(
            'resource_metadata='
        );
    });
});
