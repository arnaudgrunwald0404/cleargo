import type { SupabaseClient } from '@supabase/supabase-js';
import {
    classifyEpic,
    loadEpicLifecycleContext,
    normalizeReleaseName,
    resolveReleaseLaunchDate,
    type EpicLifecycleContext,
    type LifecycleEpicRow,
} from '../epicLifecycle';

function ymd(offsetDays: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

function ctx(over: Partial<EpicLifecycleContext> = {}): EpicLifecycleContext {
    return {
        retrosByEpic: new Map(),
        releaseSchedule: [],
        releaseToDate: new Map(),
        ...over,
    };
}

function epic(over: Partial<LifecycleEpicRow> = {}): LifecycleEpicRow {
    return { id: 'E1', status: 'Pre_Release', target_launch_date: ymd(30), ...over };
}

describe('classifyEpic', () => {
    it('excludes an archived epic without consulting anything else', () => {
        const state = classifyEpic(epic({ archived: true }), ctx());
        expect(state).toMatchObject({ excluded: true, exclusion: 'archived', active: false });
    });

    it('excludes a cancelled epic', () => {
        // 'Cancelled' is the one lifecycle value actually stored on the epic.
        const state = classifyEpic(epic({ status: 'Cancelled' }), ctx());
        expect(state).toMatchObject({ excluded: true, exclusion: 'cancelled', active: false });
    });

    it('treats an unlaunched epic as active', () => {
        const state = classifyEpic(epic({ target_launch_date: ymd(30) }), ctx());
        expect(state.active).toBe(true);
        expect(state.released).toBe(false);
        expect(state.excluded).toBe(false);
    });

    it('treats a shipped epic as released but NOT excluded', () => {
        // Post-launch work is still real work -- "Success Defined" keeps
        // nudging after release. Conflating released with excluded is what
        // would silence it.
        const state = classifyEpic(epic({ target_launch_date: ymd(-120) }), ctx());
        expect(state.released).toBe(true);
        expect(state.excluded).toBe(false);
        expect(state.active).toBe(false);
    });

    it('does not read epic.status for release state', () => {
        // Values like 'LAUNCHED' have not existed since 20260128000327; a
        // surface trusting them sees every shipped epic as live.
        const stale = classifyEpic(
            epic({ status: 'LAUNCHED', target_launch_date: ymd(30) }),
            ctx()
        );
        expect(stale.released).toBe(false);
        expect(stale.excluded).toBe(false);
    });
});

describe('normalizeReleaseName', () => {
    it('strips the prefix, including when it repeats', () => {
        expect(normalizeReleaseName('Release 2026.2')).toBe('2026.2');
        expect(normalizeReleaseName('Release Release 2026.2')).toBe('2026.2');
        expect(normalizeReleaseName('2026.2')).toBe('2026.2');
    });

    it('is case-insensitive about the prefix and trims', () => {
        expect(normalizeReleaseName('  release 2026.2  ')).toBe('2026.2');
    });

    it('passes an empty name straight through', () => {
        expect(normalizeReleaseName('')).toBe('');
    });
});

describe('resolveReleaseLaunchDate', () => {
    const withSchedule = ctx({
        releaseToDate: new Map([
            ['2026.2', '2026-06-01'],
            ['Release 2026.3', '2026-09-01'],
        ]),
    });

    it('matches when the epic carries the prefix and the schedule does not', () => {
        expect(resolveReleaseLaunchDate('Release 2026.2', withSchedule)).toBe('2026-06-01');
    });

    it('matches when the schedule carries the prefix and the epic does not', () => {
        expect(resolveReleaseLaunchDate('2026.3', withSchedule)).toBe('2026-09-01');
    });

    it('matches regardless of case', () => {
        expect(resolveReleaseLaunchDate('RELEASE 2026.2', withSchedule)).toBe('2026-06-01');
    });

    it('returns null for an unknown release and for no release', () => {
        expect(resolveReleaseLaunchDate('2027.1', withSchedule)).toBeNull();
        expect(resolveReleaseLaunchDate(null, withSchedule)).toBeNull();
    });
});

describe('loadEpicLifecycleContext', () => {
    function stub() {
        const calls: string[] = [];
        const client = {
            from(table: string) {
                calls.push(table);
                if (table === 'epic_retros') {
                    return {
                        select: () => ({
                            in: async () => ({
                                data: [
                                    { epic_id: 'E1', day_marker: 30, status: 'SUBMITTED' },
                                    { epic_id: 'E1', day_marker: 60, status: 'SUBMITTED' },
                                    { epic_id: 'E2', day_marker: 30, status: 'DRAFT' },
                                ],
                            }),
                        }),
                    };
                }
                return {
                    select: () => ({
                        eq: async () => ({
                            data: [{ release_name: 'Release 2026.2', launch_date: '2026-06-01', cohort2_date: null }],
                        }),
                    }),
                };
            },
        } as unknown as SupabaseClient;
        return { client, calls };
    }

    it('reads each table exactly once regardless of epic count', async () => {
        const { client, calls } = stub();
        await loadEpicLifecycleContext(['E1', 'E2', 'E3', 'E4'], client);
        // The whole point of the batch loader: no N+1 as surfaces adopt it.
        expect(calls.sort()).toEqual(['epic_retros', 'release_schedule']);
    });

    it('groups retros by epic', async () => {
        const { client } = stub();
        const loaded = await loadEpicLifecycleContext(['E1', 'E2'], client);
        expect(loaded.retrosByEpic.get('E1')).toHaveLength(2);
        expect(loaded.retrosByEpic.get('E2')).toHaveLength(1);
        expect(loaded.retrosByEpic.get('E3')).toBeUndefined();
    });

    it('keys release dates under both the raw and normalized name', async () => {
        const { client } = stub();
        const loaded = await loadEpicLifecycleContext(['E1'], client);
        expect(loaded.releaseToDate.get('Release 2026.2')).toBe('2026-06-01');
        expect(loaded.releaseToDate.get('2026.2')).toBe('2026-06-01');
    });

    it('queries nothing for an empty epic list', async () => {
        const { client, calls } = stub();
        const loaded = await loadEpicLifecycleContext([], client);
        expect(calls).toEqual([]);
        expect(loaded.retrosByEpic.size).toBe(0);
    });
});
