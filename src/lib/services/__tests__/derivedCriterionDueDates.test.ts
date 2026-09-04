/**
 * @jest-environment node
 */

/**
 * The release-aware derivation is the one the UI shows, and it differs from the
 * simpler nudge-job version in ways that are easy to regress: the anchor comes
 * from the release schedule rather than the epic's own target date, and a stored
 * condition date is only a fallback, never an override.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeReleaseAwareDueDates } from '../derivedCriterionDueDates';

const STAGES = [
    { id: 1, name: 'Build', sort_order: 1, duration_days: 10, scope: 'release_schedule', is_gate: false },
    { id: 2, name: 'Ready', sort_order: 2, duration_days: 5, scope: 'release_schedule', is_gate: false },
];

/**
 * The epic's own target date is deliberately different from the release GA date,
 * so a derivation that ignored the schedule would produce a different answer
 * rather than accidentally agreeing.
 */
function clientFor(opts: {
    ahaFields?: unknown;
    targetLaunchDate?: string | null;
    schedule?: Array<Record<string, unknown>>;
    stages?: Array<Record<string, unknown>>;
}) {
    const calls: string[] = [];
    const client = {
        from: (table: string) => {
            calls.push(table);
            if (table === 'epic') {
                return {
                    select: () => ({
                        in: async () => ({
                            data: [
                                {
                                    id: 'epic-1',
                                    aha_fields: opts.ahaFields ?? null,
                                    target_launch_date: opts.targetLaunchDate ?? null,
                                },
                            ],
                            error: null,
                        }),
                    }),
                };
            }
            if (table === 'release_schedule') {
                return {
                    select: () => ({
                        eq: async () => ({ data: opts.schedule ?? [], error: null }),
                    }),
                };
            }
            return {
                select: () => ({
                    order: async () => ({ data: opts.stages ?? STAGES, error: null }),
                }),
            };
        },
    } as unknown as SupabaseClient;
    return { client, calls };
}

describe('computeReleaseAwareDueDates', () => {
    it('returns an empty map for no rows without querying anything', async () => {
        const { client, calls } = clientFor({});
        const result = await computeReleaseAwareDueDates(client, []);

        expect(result.size).toBe(0);
        expect(calls).toHaveLength(0);
    });

    it('falls back to the stored condition date when no anchor resolves', async () => {
        // An epic on "Release: N/A" has no schedule row and no target date, so
        // nothing derives. Dropping these is how items vanish from overdue counts.
        const { client } = clientFor({ targetLaunchDate: null, schedule: [] });

        const result = await computeReleaseAwareDueDates(client, [
            { id: 'row-1', epicId: 'epic-1', conditionDueDate: '2026-05-01', ratingTiming: 2 },
        ]);

        expect(result.get('row-1')).toBe('2026-05-01');
    });

    it('reports null rather than omitting a row that cannot be dated at all', async () => {
        const { client } = clientFor({ targetLaunchDate: null, schedule: [] });

        const result = await computeReleaseAwareDueDates(client, [
            { id: 'row-1', epicId: 'epic-1', conditionDueDate: null, ratingTiming: 2 },
        ]);

        expect(result.has('row-1')).toBe(true);
        expect(result.get('row-1')).toBeNull();
    });

    it('derives from the epic target date when the epic has no release', async () => {
        const { client } = clientFor({ targetLaunchDate: '2026-06-30', schedule: [] });

        const result = await computeReleaseAwareDueDates(client, [
            // A stored date is present but must not win over a live derivation.
            { id: 'row-1', epicId: 'epic-1', conditionDueDate: '2020-01-01', ratingTiming: 2 },
        ]);

        const due = result.get('row-1');
        expect(due).not.toBe('2020-01-01');
        expect(due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('keys every requested row, including epics that no longer exist', async () => {
        const { client } = clientFor({ targetLaunchDate: '2026-06-30', schedule: [] });

        const result = await computeReleaseAwareDueDates(client, [
            { id: 'row-1', epicId: 'epic-1', ratingTiming: 2 },
            { id: 'row-2', epicId: 'missing-epic', ratingTiming: 2, conditionDueDate: '2026-07-07' },
        ]);

        expect(result.size).toBe(2);
        expect(result.get('row-2')).toBe('2026-07-07');
    });
});
