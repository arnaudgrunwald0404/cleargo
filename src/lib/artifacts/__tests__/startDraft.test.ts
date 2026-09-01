/**
 * The draft handoff, tested because every way it can go wrong is invisible
 * locally.
 *
 * Drafting only takes the background path when NETLIFY_URL and a secret are set
 * and the host is not localhost — which is to say, only in production. The two
 * failure modes that matter both leave a row stuck: a claim that lands before a
 * dispatch that never happens (DRAFTING forever, no worker), and a dispatch that
 * happens before a claim (two concurrent runs against the same document).
 */
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

// Two hoisting rules are load-bearing here, and getting either wrong fails the
// same silent way -- the real draftService runs and the test hits the database.
//
//   1. `jest` must be the global, NOT imported from '@jest/globals'. The SWC
//      transform only hoists jest.mock() above the imports when it sees the
//      global identifier; with the import in place the call runs in source order,
//      after '../startDraft' has already bound the real function.
//   2. The factory must not touch a `const` declared below it -- that is the
//      temporal dead zone. `var` is hoisted and initialised to undefined, and the
//      factory only dereferences it when a test calls through, long after the
//      assignment has run.
var mockDraftCalls: unknown[][] = [];
var mockDraftResult: unknown = { status: 'PENDING_REVIEW', warnings: [] };

jest.mock('../draftService', () => ({
    draftArtifact: async (...args: unknown[]) => {
        mockDraftCalls.push(args);
        return mockDraftResult;
    },
}));

import { startArtifactDraft } from '../startDraft';

const ENV_KEYS = ['NETLIFY_URL', 'URL', 'NETLIFY_ARTIFACT_DRAFT_SECRET', 'NETLIFY_HEART_SETUP_SECRET'] as const;
const original = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
    for (const key of ENV_KEYS) {
        const value = values[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

afterAll(() => {
    for (const key of ENV_KEYS) {
        if (original[key] === undefined) delete process.env[key];
        else process.env[key] = original[key]!;
    }
});

/**
 * Minimal Supabase double.
 *
 * Writes and the dispatch both append to one `events` list, because their
 * relative order is the thing most of these tests are actually asserting.
 */
function makeSupabase(row: { status: string; updated_at: string } | null) {
    const events: string[] = [];
    const updates: Array<Record<string, unknown>> = [];

    const client = {
        from() {
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({ maybeSingle: async () => ({ data: row }) }),
                    }),
                }),
                update: (payload: Record<string, unknown>) => {
                    updates.push(payload);
                    events.push(`update:${payload.status ?? Object.keys(payload).join(',')}`);
                    return { eq: () => ({ eq: async () => ({ error: null }) }) };
                },
            };
        },
    } as unknown as SupabaseClient;

    return { client, updates, events };
}

const OPTIONS = { actorEmail: 'pm@clearcompany.com' };
const NOW = new Date().toISOString();

beforeEach(() => {
    jest.clearAllMocks();
    mockDraftCalls = [];
    global.fetch = jest.fn() as unknown as typeof fetch;
});

describe('startArtifactDraft — background path', () => {
    beforeEach(() => {
        setEnv({ NETLIFY_URL: 'https://cleargo.netlify.app', NETLIFY_ARTIFACT_DRAFT_SECRET: 's3cret' });
    });

    it('claims the row BEFORE dispatching', async () => {
        const { client, events } = makeSupabase({ status: 'NOT_STARTED', updated_at: NOW });
        (global.fetch as jest.Mock).mockImplementation(async () => {
            events.push('dispatch');
            return { ok: true } as Response;
        });

        const result = await startArtifactDraft('launch-1', 'story_brief', OPTIONS, client);

        expect(result).toEqual({ outcome: 'accepted', artifactType: 'story_brief' });
        // If these ever swap, a second caller races past the already-running guard.
        expect(events).toEqual(['update:DRAFTING', 'dispatch']);
    });

    it('releases the claim when the dispatch fails', async () => {
        const { client, updates } = makeSupabase({ status: 'CHANGES_REQUESTED', updated_at: NOW });
        (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 } as never);

        const result = await startArtifactDraft('launch-1', 'story_brief', OPTIONS, client);

        expect(result).toEqual({ outcome: 'dispatch_failed' });
        // Claimed, then restored to what it was — not left stranded in DRAFTING.
        expect(updates.map((u) => u.status)).toEqual(['DRAFTING', 'CHANGES_REQUESTED']);
    });

    it('releases the claim when the dispatch throws', async () => {
        const { client, updates } = makeSupabase({ status: 'NOT_STARTED', updated_at: NOW });
        (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET') as never);

        const result = await startArtifactDraft('launch-1', 'story_brief', OPTIONS, client);

        expect(result).toEqual({ outcome: 'dispatch_failed' });
        expect(updates.map((u) => u.status)).toEqual(['DRAFTING', 'NOT_STARTED']);
    });

    it('writes the change request to the row before dispatching', async () => {
        // The background worker is handed no change request; draftArtifact reads
        // it off the row, so it has to be persisted first or a section re-draft
        // silently becomes a full re-draft.
        const { client, updates } = makeSupabase({ status: 'PENDING_REVIEW', updated_at: NOW });
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as never);

        await startArtifactDraft(
            'launch-1',
            'messaging_brief',
            { ...OPTIONS, changeRequestNote: 'Rework the message house.' },
            client
        );

        expect(updates[0]).toEqual({ change_request_note: 'Rework the message house.' });
    });

    it('refuses while a draft is genuinely in flight', async () => {
        const { client, updates } = makeSupabase({ status: 'DRAFTING', updated_at: new Date().toISOString() });

        const result = await startArtifactDraft('launch-1', 'story_brief', OPTIONS, client);

        expect(result).toEqual({ outcome: 'already_running' });
        expect(updates).toHaveLength(0);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('restarts a stalled draft', async () => {
        // A worker killed before its error handler leaves the row DRAFTING
        // forever. Refusing on that basis would disable the artifact permanently.
        const longAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { client } = makeSupabase({ status: 'DRAFTING', updated_at: longAgo });
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as never);

        const result = await startArtifactDraft('launch-1', 'story_brief', OPTIONS, client);

        expect(result).toEqual({ outcome: 'accepted', artifactType: 'story_brief' });
    });

    it('reports a missing row rather than dispatching into the void', async () => {
        const { client } = makeSupabase(null);

        const result = await startArtifactDraft('launch-1', 'story_brief', OPTIONS, client);

        expect(result).toEqual({ outcome: 'not_found' });
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('startArtifactDraft — inline path', () => {
    it('runs inline off Netlify, where there is no 26s cap', async () => {
        setEnv({ NETLIFY_URL: 'http://localhost:3000', NETLIFY_ARTIFACT_DRAFT_SECRET: 's3cret' });

        const { client, updates } = makeSupabase({ status: 'NOT_STARTED', updated_at: NOW });

        const result = await startArtifactDraft('launch-1', 'story_brief', OPTIONS, client);

        expect(result).toMatchObject({ outcome: 'completed' });
        expect(mockDraftCalls).toHaveLength(1);
        // No claim, because nothing is being handed off.
        expect(updates).toHaveLength(0);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
