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

jest.mock('../../../src/lib/artifacts/draftService', () => ({
    draftArtifact: jest.fn(),
}));

type Handler = (req: Request) => Promise<Response>;

const { createClient } = jest.requireMock('@supabase/supabase-js') as { createClient: jest.Mock };
const { draftArtifact } = jest.requireMock('../../../src/lib/artifacts/draftService') as {
    draftArtifact: jest.Mock;
};
const handler = jest.requireActual<{ default: Handler }>('../artifact-draft-background').default;

const LAUNCH_ID = 'launch-001';

/**
 * Records the update payload so the failure path can be asserted on.
 *
 * The mocks carry explicit call signatures: inferred ones would be zero-arg and
 * every toHaveBeenCalledWith below would fail to compile.
 */
function mockSupabase() {
    const eq2 = jest.fn<(column: string, value: unknown) => Promise<{ error: null }>>(() =>
        Promise.resolve({ error: null })
    );
    const eq1 = jest.fn<(column: string, value: unknown) => { eq: typeof eq2 }>(() => ({ eq: eq2 }));
    const update = jest.fn<(payload: Record<string, unknown>) => { eq: typeof eq1 }>(() => ({
        eq: eq1,
    }));
    const from = jest.fn<(table: string) => { update: typeof update }>(() => ({ update }));
    createClient.mockReturnValue({ from });
    return { from, update };
}

function makeRequest(body: Record<string, unknown>, method = 'POST'): Request {
    return new Request('http://localhost/.netlify/functions/artifact-draft-background', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify(body) : undefined,
    });
}

const validBody = {
    launchId: LAUNCH_ID,
    artifactType: 'story_brief',
    previousStatus: 'CHANGES_REQUESTED',
    secret: 'right-secret',
};

describe('artifact-draft-background', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
        expect(draftArtifact).not.toHaveBeenCalled();
    });

    it('rejects a missing artifactType', async () => {
        mockSupabase();
        const res = await handler(makeRequest({ ...validBody, artifactType: undefined }));
        expect(res.status).toBe(400);
        expect(draftArtifact).not.toHaveBeenCalled();
    });

    it('runs the draft and passes the source notes through', async () => {
        mockSupabase();
        draftArtifact.mockResolvedValue({
            status: 'PENDING_REVIEW',
            flagsRaised: 3,
            docUpdated: true,
            warnings: [],
        } as never);

        const res = await handler(makeRequest({ ...validBody, sourceNotes: 'from the call' }));

        expect(res.status).toBe(200);
        expect(draftArtifact).toHaveBeenCalledWith(
            LAUNCH_ID,
            'story_brief',
            expect.objectContaining({ sourceNotes: 'from the call' }),
            expect.anything()
        );
    });

    /**
     * The reason this worker exists rather than a fire-and-forget promise:
     * draftArtifact marks the row DRAFTING before the LLM call and has no catch
     * of its own, so an unhandled throw strands it there and the panel polls a
     * spinner that never resolves.
     */
    it('restores the previous status when drafting throws', async () => {
        const { from, update } = mockSupabase();
        draftArtifact.mockRejectedValue(new Error('model timed out') as never);

        const res = await handler(makeRequest(validBody));

        expect(res.status).toBe(500);
        expect(from).toHaveBeenCalledWith('launch_artifact');
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'CHANGES_REQUESTED',
                change_request_note: expect.stringContaining('model timed out'),
            })
        );
    });

    it('falls back to NOT_STARTED when no previous status was supplied', async () => {
        const { update } = mockSupabase();
        draftArtifact.mockRejectedValue(new Error('boom') as never);

        await handler(makeRequest({ ...validBody, previousStatus: undefined }));

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'NOT_STARTED' })
        );
    });
});
