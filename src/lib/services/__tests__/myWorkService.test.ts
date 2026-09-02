import type { SupabaseClient } from '@supabase/supabase-js';

const loadLaunchHomeWork = jest.fn();
const loadHomeBriefs = jest.fn();

jest.mock('@/lib/services/launchHomeService', () => ({
    loadLaunchHomeWork: (...a: unknown[]) => loadLaunchHomeWork(...a),
    loadHomeBriefs: (...a: unknown[]) => loadHomeBriefs(...a),
}));

jest.mock('@/lib/supabase/server', () => ({
    createAdminClient: () => {
        throw new Error('tests must pass an explicit client');
    },
}));

import { getMyWork, isBlockedStatus, isOwedStatus, survivesRelease } from '../myWorkService';

function ymd(offsetDays: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

interface EpicFixture {
    id: string;
    status?: string;
    archived?: boolean;
    target_launch_date?: string | null;
}

function item(over: {
    id: string;
    status: string | null;
    epicId?: string;
    label?: string;
}) {
    return {
        id: over.id,
        status: over.status,
        condition: null,
        condition_due_date: null,
        last_updated_at: '2026-08-01T00:00:00.000Z',
        launch: { id: over.epicId ?? 'E1', name: 'Agent Platform', tier: 'TIER_1' },
        criterion: { label: over.label ?? 'Security review', gate: false },
    };
}

/** Minimal stand-in for the RPC + epic read + lifecycle reads. */
function stubClient(rows: unknown[], epics: EpicFixture[]) {
    return {
        rpc: async () => ({ data: rows, error: null }),
        from(table: string) {
            if (table === 'epic') {
                return { select: () => ({ in: async () => ({ data: epics }) }) };
            }
            if (table === 'epic_retros') {
                return { select: () => ({ in: async () => ({ data: [] }) }) };
            }
            return { select: () => ({ eq: async () => ({ data: [] }) }) };
        },
    } as unknown as SupabaseClient;
}

beforeEach(() => {
    loadLaunchHomeWork.mockReset().mockResolvedValue({ artifacts: [], unassigned: [] });
    loadHomeBriefs.mockReset().mockResolvedValue([]);
});

describe('status predicates', () => {
    it('treats only unanswered items as owed', () => {
        expect(isOwedStatus('NOT_SET')).toBe(true);
        expect(isOwedStatus(null)).toBe(true);
        expect(isOwedStatus('GO')).toBe(false);
        expect(isOwedStatus('NO_GO')).toBe(false);
        expect(isOwedStatus('NOT_APPLICABLE')).toBe(false);
    });

    it('treats an adverse verdict as blocked, not owed', () => {
        // The nudge jobs call NO_GO complete; 1:1 prep calls it the blocker.
        // Both are right, which is why these are two predicates.
        expect(isBlockedStatus('NO_GO')).toBe(true);
        expect(isBlockedStatus('CONDITIONAL')).toBe(true);
        expect(isBlockedStatus('CONDITIONAL_GO')).toBe(true);
        expect(isBlockedStatus('NOT_SET')).toBe(false);
        expect(isBlockedStatus('GO')).toBe(false);
    });

    it('nothing is both owed and blocked', () => {
        for (const s of ['NOT_SET', 'GO', 'NO_GO', 'CONDITIONAL', 'NOT_APPLICABLE', null]) {
            expect(isOwedStatus(s) && isBlockedStatus(s)).toBe(false);
        }
    });
});

describe('survivesRelease', () => {
    it('keeps only Success Defined once an epic has shipped', () => {
        expect(survivesRelease({ criterion: { label: 'Success Defined' } })).toBe(true);
        expect(survivesRelease({ criterion: { label: 'success defined for GA' } })).toBe(true);
        expect(survivesRelease({ criterion: { label: 'Security review' } })).toBe(false);
    });
});

describe('getMyWork', () => {
    const live: EpicFixture[] = [{ id: 'E1', status: 'Pre_Release', archived: false, target_launch_date: ymd(30) }];

    it('splits owed from blocked instead of merging them', async () => {
        const client = stubClient(
            [
                item({ id: 'A', status: 'NOT_SET' }),
                item({ id: 'B', status: 'NO_GO' }),
                item({ id: 'C', status: 'GO' }),
            ],
            live
        );

        const work = await getMyWork('pm@clearcompany.com', { supabase: client });

        expect(work.owed.map((o) => o.id)).toEqual(['A']);
        expect(work.blocked.map((o) => o.id)).toEqual(['B']);
        // GO is neither: it is finished.
        expect([...work.owed, ...work.blocked].map((o) => o.id)).not.toContain('C');
    });

    it('drops items on a cancelled epic', async () => {
        const client = stubClient([item({ id: 'A', status: 'NOT_SET' })], [
            { id: 'E1', status: 'Cancelled', archived: false, target_launch_date: ymd(30) },
        ]);

        const work = await getMyWork('pm@clearcompany.com', { supabase: client });
        expect(work.owed).toHaveLength(0);
    });

    it('drops items on an archived epic', async () => {
        const client = stubClient([item({ id: 'A', status: 'NOT_SET' })], [
            { id: 'E1', status: 'Pre_Release', archived: true, target_launch_date: ymd(30) },
        ]);

        const work = await getMyWork('pm@clearcompany.com', { supabase: client });
        expect(work.owed).toHaveLength(0);
    });

    it('keeps only Success Defined once the epic has shipped', async () => {
        const shipped: EpicFixture[] = [
            { id: 'E1', status: 'Pre_Release', archived: false, target_launch_date: ymd(-120) },
        ];
        const client = stubClient(
            [
                item({ id: 'A', status: 'NOT_SET', label: 'Security review' }),
                item({ id: 'B', status: 'NOT_SET', label: 'Success Defined' }),
            ],
            shipped
        );

        const work = await getMyWork('pm@clearcompany.com', { supabase: client });

        expect(work.owed.map((o) => o.id)).toEqual(['B']);
        expect(work.owed[0].postLaunch).toBe(true);
    });

    it('keeps an item whose epic could not be read rather than hiding real work', async () => {
        const client = stubClient([item({ id: 'A', status: 'NOT_SET', epicId: 'MISSING' })], []);
        const work = await getMyWork('pm@clearcompany.com', { supabase: client });
        expect(work.owed.map((o) => o.id)).toEqual(['A']);
    });

    it('returns both sides together', async () => {
        loadLaunchHomeWork.mockResolvedValue({
            artifacts: [{ label: 'Messaging Brief' }],
            unassigned: [{ launchId: 'L1', launchName: 'Q4', count: 3 }],
        });
        loadHomeBriefs.mockResolvedValue([{ target: { epicName: 'Agent Platform' }, openCount: 2 }]);

        const work = await getMyWork('pm@clearcompany.com', {
            supabase: stubClient([item({ id: 'A', status: 'NOT_SET' })], live),
        });

        // The gap this closes: no surface answered across both sides before.
        expect(work.owed).toHaveLength(1);
        expect(work.launchArtifacts).toHaveLength(1);
        expect(work.unassignedLaunchWork).toHaveLength(1);
        expect(work.storyBriefs).toHaveLength(1);
        expect(work.degraded).toEqual({});
    });

    it('degrades one section instead of failing the whole answer', async () => {
        loadLaunchHomeWork.mockRejectedValue(new Error('launch table unavailable'));

        const work = await getMyWork('pm@clearcompany.com', {
            supabase: stubClient([item({ id: 'A', status: 'NOT_SET' })], live),
        });

        // A launch-table failure must not blank the release list; the Slack
        // home tab depended on this and each caller used to reinvent it.
        expect(work.owed).toHaveLength(1);
        expect(work.launchArtifacts).toEqual([]);
        expect(work.degraded.launch).toContain('launch table unavailable');
        expect(work.degraded.release).toBeUndefined();
    });

    it('reports a release-side failure without losing the launch side', async () => {
        loadLaunchHomeWork.mockResolvedValue({ artifacts: [{ label: 'Messaging Brief' }], unassigned: [] });
        const broken = {
            rpc: async () => ({ data: null, error: { message: 'rpc exploded' } }),
            from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }),
        } as unknown as SupabaseClient;

        const work = await getMyWork('pm@clearcompany.com', { supabase: broken });

        expect(work.degraded.release).toContain('rpc exploded');
        expect(work.launchArtifacts).toHaveLength(1);
    });

    it('can skip the launch side for callers that only speak releases', async () => {
        const work = await getMyWork('pm@clearcompany.com', {
            supabase: stubClient([item({ id: 'A', status: 'NOT_SET' })], live),
            includeLaunchSide: false,
            includeStoryBriefs: false,
        });

        expect(loadLaunchHomeWork).not.toHaveBeenCalled();
        expect(loadHomeBriefs).not.toHaveBeenCalled();
        expect(work.owed).toHaveLength(1);
    });
});
