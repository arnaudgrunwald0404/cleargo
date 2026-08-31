import { describe, it, expect, jest, beforeEach } from '@jest/globals';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.NETLIFY_ARTIFACT_DRAFT_SECRET = 'right-secret';

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

jest.mock('../../../src/lib/db', () => ({
    setOverrideAdminClient: jest.fn(),
}));

jest.mock('../../../src/lib/artifacts/docFactory', () => ({
    ensureLaunchArtifacts: jest.fn(),
}));

type Handler = (req: Request) => Promise<Response>;

const { createClient } = jest.requireMock('@supabase/supabase-js') as { createClient: jest.Mock };
const { ensureLaunchArtifacts } = jest.requireMock('../../../src/lib/artifacts/docFactory') as {
    ensureLaunchArtifacts: jest.Mock;
};
const handler = jest.requireActual<{ default: Handler }>('../launch-artifacts-background').default;

const LAUNCH_ID = 'launch-001';

function makeRequest(body: Record<string, unknown>, method = 'POST'): Request {
    return new Request('http://localhost/.netlify/functions/launch-artifacts-background', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify(body) : undefined,
    });
}

const validBody = { launchId: LAUNCH_ID, secret: 'right-secret' };

const okResult = {
    created: 5,
    docsCreated: 5,
    skipped: 0,
    googleConfigured: true,
    errors: [],
};

describe('launch-artifacts-background', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        createClient.mockReturnValue({});
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('rejects a non-POST request', async () => {
        const res = await handler(makeRequest({}, 'GET'));
        expect(res.status).toBe(405);
    });

    it('rejects a wrong secret', async () => {
        const res = await handler(makeRequest({ ...validBody, secret: 'wrong' }));
        expect(res.status).toBe(401);
        expect(ensureLaunchArtifacts).not.toHaveBeenCalled();
    });

    it('rejects a missing launchId', async () => {
        const res = await handler(makeRequest({ secret: 'right-secret' }));
        expect(res.status).toBe(400);
        expect(ensureLaunchArtifacts).not.toHaveBeenCalled();
    });

    it('sets up the artifacts and returns the counts', async () => {
        ensureLaunchArtifacts.mockResolvedValue(okResult as never);

        const res = await handler(makeRequest(validBody));

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, ...okResult });
        expect(ensureLaunchArtifacts).toHaveBeenCalledWith(LAUNCH_ID, expect.anything());
    });

    /**
     * Partial success is the normal case before Google is configured, and it must
     * not read as a failure — the rows are what make the runway work, and a later
     * "Create missing documents" fills the documents in.
     */
    it('reports a partial run as success', async () => {
        ensureLaunchArtifacts.mockResolvedValue({
            ...okResult,
            docsCreated: 0,
            googleConfigured: false,
            errors: ['Story Brief: No template configured'],
        } as never);

        const res = await handler(makeRequest(validBody));

        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });

    /**
     * Netlify answers a background invocation with 202 before the work starts, so
     * the only trace of a failure is this log line. Nothing is rolled back:
     * ensureLaunchArtifacts is idempotent and the next run completes the job.
     */
    it('returns the message when setup throws', async () => {
        ensureLaunchArtifacts.mockRejectedValue(new Error('Drive quota exceeded') as never);

        const res = await handler(makeRequest(validBody));

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ ok: false, error: 'Drive quota exceeded' });
    });
});
