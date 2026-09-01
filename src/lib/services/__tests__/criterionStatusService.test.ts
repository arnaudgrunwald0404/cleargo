import type { SupabaseClient } from '@supabase/supabase-js';

const mockRules = jest.fn();
const mockFlags = jest.fn();
const mockRecompute = jest.fn();
const mockLogStatusChange = jest.fn();
const mockGateNudge = jest.fn();
const mockTrackActivity = jest.fn();

jest.mock('@/lib/settings-db', () => ({
    getEffectivePermissionRules: (...a: unknown[]) => mockRules(...a),
    getFeatureFlags: (...a: unknown[]) => mockFlags(...a),
}));
jest.mock('@/lib/readiness', () => ({
    recomputeEpicReadiness: (...a: unknown[]) => mockRecompute(...a),
}));
jest.mock('@/lib/db/criterion-status-history', () => ({
    logStatusChange: (...a: unknown[]) => mockLogStatusChange(...a),
}));
jest.mock('@/lib/services/gateSignoffService', () => ({
    maybeNotifyGateOwnerForCategory: (...a: unknown[]) => mockGateNudge(...a),
}));
jest.mock('@/lib/services/userActivityService', () => ({
    trackActivityFromAction: (...a: unknown[]) => mockTrackActivity(...a),
}));

import { scoreEpicCriterion, SCOREABLE_STATUSES } from '../criterionStatusService';

const ACTOR = {
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    email: 'pm@clearcompany.com',
    roles: ['PM'],
};

/** Refuses to be used. A refusal must never reach the database. */
const NO_DB = new Proxy({} as SupabaseClient, {
    get() {
        throw new Error('the database was touched after a refusal');
    },
});

interface StubOpts {
    existing?: Record<string, unknown> | null;
    updateError?: string;
    auditError?: string;
}

function stub(opts: StubOpts = {}) {
    const captured: { update?: Record<string, unknown>; auditRow?: Record<string, unknown> } = {};
    const existing =
        opts.existing === undefined
            ? { id: 'S1', status: 'NOT_SET', criterion_id: 'C1', criterion: { gate: false } }
            : opts.existing;

    const client = {
        from(table: string) {
            if (table === 'audit_log') {
                return {
                    insert: async (row: Record<string, unknown>) => {
                        captured.auditRow = row;
                        return { error: opts.auditError ? { message: opts.auditError } : null };
                    },
                };
            }
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
                    }),
                }),
                update: (payload: Record<string, unknown>) => {
                    captured.update = payload;
                    return {
                        eq: () => ({
                            eq: () => ({
                                select: () => ({
                                    single: async () => ({
                                        data: opts.updateError
                                            ? null
                                            : { ...(existing ?? {}), ...payload },
                                        error: opts.updateError ? { message: opts.updateError } : null,
                                    }),
                                }),
                            }),
                        }),
                    };
                },
            };
        },
    } as unknown as SupabaseClient;

    return { client, captured };
}

beforeEach(() => {
    mockRules.mockReset().mockResolvedValue({ 'criteria.status.update': ['PM', 'PMM'] });
    mockFlags.mockReset().mockResolvedValue([]);
    mockRecompute.mockReset().mockResolvedValue(undefined);
    mockLogStatusChange.mockReset().mockResolvedValue(undefined);
    mockGateNudge.mockReset().mockResolvedValue(undefined);
    mockTrackActivity.mockReset().mockResolvedValue(undefined);
});

describe('authorization', () => {
    it('refuses a role the effective rules exclude, before touching the database', async () => {
        const result = await scoreEpicCriterion(
            'E1',
            'S1',
            { status: 'GO' },
            { ...ACTOR, roles: ['ENG'] },
            { supabase: NO_DB }
        );
        expect(result).toEqual({
            outcome: 'forbidden',
            reason: 'You do not have permission to score criteria.',
        });
    });

    it('honours an admin override that widens the capability', async () => {
        mockRules.mockResolvedValue({ 'criteria.status.update': ['ENG'] });
        const { client } = stub();
        const result = await scoreEpicCriterion(
            'E1',
            'S1',
            { status: 'GO' },
            { ...ACTOR, roles: ['ENG'] },
            { supabase: client }
        );
        expect(result.outcome).toBe('updated');
    });
});

describe('value validation', () => {
    it('rejects a status the scoring engine cannot read, before touching the database', async () => {
        // The column is bare text with no CHECK, so this function is the constraint.
        const result = await scoreEpicCriterion(
            'E1',
            'S1',
            { status: 'LGTM' },
            ACTOR,
            { supabase: NO_DB }
        );
        expect(result.outcome).toBe('rejected');
        if (result.outcome === 'rejected') expect(result.reason).toContain('LGTM');
    });

    it('accepts every status the engine does understand', async () => {
        for (const status of SCOREABLE_STATUSES) {
            mockFlags.mockResolvedValue(['not_applicable']);
            const { client } = stub();
            const result = await scoreEpicCriterion('E1', 'S1', { status }, ACTOR, {
                supabase: client,
                readiness: 'skip',
            });
            expect(result.outcome).toBe('updated');
        }
    });

    it('normalizes the N/A aliases the web app has always accepted', async () => {
        mockFlags.mockResolvedValue(['not_applicable']);
        for (const alias of ['NA', 'n/a', 'not_applicable']) {
            const { client, captured } = stub();
            await scoreEpicCriterion('E1', 'S1', { status: alias }, ACTOR, {
                supabase: client,
                readiness: 'skip',
            });
            expect(captured.update?.status).toBe('NOT_APPLICABLE');
        }
    });
});

describe('Not Applicable rules', () => {
    it('refuses N/A when the feature flag is off', async () => {
        mockFlags.mockResolvedValue([]);
        const { client } = stub();
        const result = await scoreEpicCriterion('E1', 'S1', { status: 'NOT_APPLICABLE' }, ACTOR, {
            supabase: client,
        });
        expect(result.outcome).toBe('rejected');
    });

    it('refuses N/A on a gating criterion even with the flag on', async () => {
        // Waiving a gate defeats the point of a gate.
        mockFlags.mockResolvedValue(['not_applicable']);
        const { client } = stub({
            existing: { id: 'S1', status: 'NOT_SET', criterion_id: 'C1', criterion: { gate: true } },
        });
        const result = await scoreEpicCriterion('E1', 'S1', { status: 'NOT_APPLICABLE' }, ACTOR, {
            supabase: client,
        });
        expect(result.outcome).toBe('rejected');
        if (result.outcome === 'rejected') expect(result.reason).toContain('gating');
    });
});

describe('the write', () => {
    it('stamps the actor uuid, not their email', async () => {
        const { client, captured } = stub();
        await scoreEpicCriterion('E1', 'S1', { status: 'GO' }, ACTOR, { supabase: client });
        expect(captured.update?.last_updated_by).toBe(ACTOR.id);
        expect(String(captured.update?.last_updated_by)).not.toContain('@');
    });

    it('is sparse: an absent field is not written as null', async () => {
        const { client, captured } = stub();
        await scoreEpicCriterion('E1', 'S1', { status: 'GO' }, ACTOR, { supabase: client });
        expect(captured.update).not.toHaveProperty('current_status_notes');
        expect(captured.update).not.toHaveProperty('condition');
    });

    it('reports a missing row rather than writing blind', async () => {
        const { client } = stub({ existing: null });
        const result = await scoreEpicCriterion('E1', 'S1', { status: 'GO' }, ACTOR, {
            supabase: client,
        });
        expect(result.outcome).toBe('not_found');
    });
});

describe('side effects', () => {
    it('writes the audit trail when the status actually changed', async () => {
        const { client, captured } = stub();
        await scoreEpicCriterion('E1', 'S1', { status: 'GO' }, ACTOR, { supabase: client });

        expect(captured.auditRow).toMatchObject({
            actor_id: ACTOR.id,
            entity_type: 'epic_criterion_status',
            entity_id: 'S1',
            json_diff: { status: { old: 'NOT_SET', new: 'GO' } },
        });
        expect(mockLogStatusChange).toHaveBeenCalledTimes(1);
    });

    it('does not write an audit row when the status did not change', async () => {
        const { client, captured } = stub({
            existing: { id: 'S1', status: 'GO', criterion_id: 'C1', criterion: { gate: false } },
        });
        await scoreEpicCriterion('E1', 'S1', { status: 'GO' }, ACTOR, { supabase: client });
        expect(captured.auditRow).toBeUndefined();
        expect(mockLogStatusChange).not.toHaveBeenCalled();
    });

    it('surfaces a failed audit write as a warning rather than losing it silently', async () => {
        const { client } = stub({ auditError: 'audit table unavailable' });
        const result = await scoreEpicCriterion('E1', 'S1', { status: 'GO' }, ACTOR, {
            supabase: client,
        });
        expect(result.outcome).toBe('updated');
        if (result.outcome === 'updated') {
            expect(result.warnings.join(' ')).toContain('audit table unavailable');
        }
    });

    it('runs the gate sign-off check on any status write', async () => {
        const { client } = stub();
        await scoreEpicCriterion('E1', 'S1', { status: 'GO' }, ACTOR, { supabase: client });
        expect(mockGateNudge).toHaveBeenCalledWith('E1', 'S1', client);
    });
});

describe('readiness', () => {
    it('awaits the recompute by default, passing the actor and the client', async () => {
        const { client } = stub();
        const result = await scoreEpicCriterion('E1', 'S1', { status: 'GO' }, ACTOR, {
            supabase: client,
        });
        // The client argument matters: recomputeEpicReadiness would otherwise
        // build a cookie-backed one and read nothing outside a browser session.
        expect(mockRecompute).toHaveBeenCalledWith('E1', ACTOR.id, client);
        if (result.outcome === 'updated') expect(result.readiness).toBe('recomputed');
    });

    it('skips it on request, for callers on a 3-second budget', async () => {
        const { client } = stub();
        const result = await scoreEpicCriterion('E1', 'S1', { status: 'GO' }, ACTOR, {
            supabase: client,
            readiness: 'skip',
        });
        expect(mockRecompute).not.toHaveBeenCalled();
        if (result.outcome === 'updated') expect(result.readiness).toBe('skipped');
    });

    it('never fails the score because readiness failed', async () => {
        mockRecompute.mockRejectedValue(new Error('aha write-back timed out'));
        const { client } = stub();
        const result = await scoreEpicCriterion('E1', 'S1', { status: 'GO' }, ACTOR, {
            supabase: client,
        });
        expect(result.outcome).toBe('updated');
        if (result.outcome === 'updated') {
            expect(result.readiness).toBe('failed');
            expect(result.warnings.join(' ')).toContain('aha write-back timed out');
        }
    });
});
