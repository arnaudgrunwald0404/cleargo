import type { SupabaseClient } from '@supabase/supabase-js';
import { markLaunchCriterionDone } from '../criterionCompletion';

const UUID = '3f1c9a2e-0b4d-4a77-9c1e-6d2f8b5a4c31';

/**
 * Captures what actually reaches `.update()`. The bug this file exists for was
 * invisible because every caller discarded the write and kept only the error
 * string, so asserting on the payload is the whole point.
 */
function stubClient(opts: { userId?: string | null; updateError?: string } = {}) {
    const captured: { payload?: Record<string, unknown>; filters: Record<string, string> } = {
        filters: {},
    };

    const client = {
        from(table: string) {
            if (table === 'app_user') {
                return {
                    select: () => ({
                        ilike: () => ({
                            maybeSingle: async () => ({
                                data: opts.userId === undefined ? { id: UUID } : opts.userId ? { id: opts.userId } : null,
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            if (table === 'launch_criterion_status') {
                return {
                    update: (payload: Record<string, unknown>) => {
                        captured.payload = payload;
                        const chain = {
                            eq: (col: string, val: string) => {
                                captured.filters[col] = val;
                                return chain;
                            },
                            then: (resolve: (r: unknown) => void) =>
                                resolve({ error: opts.updateError ? { message: opts.updateError } : null }),
                        };
                        return chain;
                    },
                };
            }
            throw new Error(`unexpected table ${table}`);
        },
    } as unknown as SupabaseClient;

    return { client, captured };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('markLaunchCriterionDone', () => {
    it('writes the app_user uuid, never the email', async () => {
        const { client, captured } = stubClient();

        const result = await markLaunchCriterionDone(client, {
            launchId: 'L1',
            criterionId: 'C1',
            actorEmail: 'someone@clearcompany.com',
        });

        expect(result.done).toBe(true);
        // The regression: last_updated_by is UUID REFERENCES app_user(id), and
        // every caller used to put an email here.
        expect(captured.payload?.last_updated_by).toBe(UUID);
        expect(String(captured.payload?.last_updated_by)).toMatch(UUID_RE);
        expect(captured.payload?.last_updated_by).not.toContain('@');
    });

    it('marks the criterion DONE and scopes the write to one launch and criterion', async () => {
        const { client, captured } = stubClient();

        await markLaunchCriterionDone(client, {
            launchId: 'L1',
            criterionId: 'C1',
            actorEmail: 'someone@clearcompany.com',
        });

        expect(captured.payload?.status).toBe('DONE');
        expect(captured.filters).toEqual({ launch_id: 'L1', criterion_id: 'C1' });
    });

    it('still completes the criterion when the approver matches no ClearGO user', async () => {
        const { client, captured } = stubClient({ userId: null });

        const result = await markLaunchCriterionDone(client, {
            launchId: 'L1',
            criterionId: 'C1',
            actorEmail: 'stranger@example.com',
        });

        // The launch moving matters more than the attribution; the column is
        // nullable precisely so this is not a hard failure.
        expect(result.done).toBe(true);
        expect(captured.payload?.last_updated_by).toBeNull();
        expect(result.warning).toContain('unattributed');
    });

    it('reports a real update failure rather than claiming success', async () => {
        const { client } = stubClient({ updateError: 'permission denied' });

        const result = await markLaunchCriterionDone(client, {
            launchId: 'L1',
            criterionId: 'C1',
            actorEmail: 'someone@clearcompany.com',
        });

        expect(result.done).toBe(false);
        expect(result.warning).toContain('permission denied');
    });

    it('says so when the artifact has no criterion behind it', async () => {
        const { client, captured } = stubClient();

        const result = await markLaunchCriterionDone(client, {
            launchId: 'L1',
            criterionId: null,
            actorEmail: 'someone@clearcompany.com',
        });

        expect(result.done).toBe(false);
        expect(result.warning).toContain('not linked to a readiness criterion');
        expect(captured.payload).toBeUndefined();
    });
});
