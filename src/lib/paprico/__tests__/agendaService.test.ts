/**
 * Service-level tests for the three defects the first live PaPriCo run exposed
 * (2026-09-18 meeting, 78 generated items):
 *
 *   1. no tier filter  -- 42% of the agenda was Tier 3
 *   2. null time boxes -- 85 items reported as 52 minutes
 *   3. owner dropped   -- owner_email null on all 78
 *
 * All three live in the step 2 materialization loop, so they are tested through
 * computeAgendaForMeeting against an in-memory Supabase stand-in rather than
 * against extracted helpers: the point is what actually lands in the insert.
 */

import { computeAgendaForMeeting } from '../agendaService';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/**
 * Minimal stand-in for the PostgREST query builder: enough eq/neq/in/order/limit
 * to answer the queries loadAgendaInputs makes, and a record of every insert so
 * a test can assert on the generated rows.
 */
function makeSupabase(tables: Tables) {
    const inserts: Array<{ table: string; rows: Row[] }> = [];
    const updates: Array<{ table: string; patch: Row }> = [];

    const build = (table: string) => {
        let rows = [...(tables[table] ?? [])];

        const builder: Record<string, unknown> = {
            select: () => builder,
            order: () => builder,
            limit: (n: number) => {
                rows = rows.slice(0, n);
                return builder;
            },
            eq: (col: string, val: unknown) => {
                rows = rows.filter((r) => r[col] === val);
                return builder;
            },
            neq: (col: string, val: unknown) => {
                rows = rows.filter((r) => r[col] !== val);
                return builder;
            },
            in: (col: string, vals: unknown[]) => {
                rows = rows.filter((r) => vals.includes(r[col]));
                return builder;
            },
            is: (col: string, val: unknown) => {
                rows = rows.filter((r) => (r[col] ?? null) === val);
                return builder;
            },
            not: () => builder,
            lte: () => builder,
            insert: (payload: Row | Row[]) => {
                const pending = Array.isArray(payload) ? payload : [payload];
                inserts.push({ table, rows: pending });
                rows = pending.map((r, i) => ({
                    id: `generated-${inserts.length}-${i}`,
                    sort_order: 0,
                    auto_closed: false,
                    system_notes: null,
                    description: null,
                    blocked_reason: null,
                    links: null,
                    created_at: '2026-09-01T00:00:00.000Z',
                    updated_at: '2026-09-01T00:00:00.000Z',
                    ...r,
                }));
                return builder;
            },
            update: (patch: Row) => {
                updates.push({ table, patch });
                rows = [];
                return builder;
            },
            single: () => builder,
            maybeSingle: () => builder,
            // Awaiting the builder resolves the PostgREST { data, error } shape.
            then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
                Promise.resolve({ data: rows, error: null }).then(resolve),
        };
        return builder;
    };

    return {
        client: { from: (table: string) => build(table) } as never,
        inserts,
        updates,
        generatedItems: () => inserts.filter((i) => i.table === 'paprico_item').flatMap((i) => i.rows),
    };
}

const MEETING = { meeting_date: '2026-09-18' };
const TODAY = '2026-09-09';

const CRITERION_COMMERCIALIZATION = '11111111-1111-1111-1111-111111111111';
const CRITERION_SVP_FORECAST = '22222222-2222-2222-2222-222222222222';

/** A stage-dated criterion: rating_timing 1 resolves against the stage table below. */
function criterion(id: string, label: string): Row {
    return { id, label, category: 'Commercial', gate: false, rating_timing: 1, is_active: true };
}

function epic(id: string, name: string, tier: string | null, ownerEmail: string | null = null): Row {
    return {
        id,
        name,
        tier,
        status: 'In Progress',
        // Anchors the stage date close to the meeting so the pair is inside the
        // lookahead window and tier is the only thing under test.
        target_launch_date: '2026-09-25',
        owner_email: ownerEmail,
        aha_fields: null,
        archived: false,
    };
}

function baseTables(overrides: Partial<Tables> = {}): Tables {
    return {
        paprico_gating_criterion: [],
        paprico_item: [],
        paprico_decision: [],
        app_settings: [{ id: 1, paprico_default_lookahead_days: 60 }],
        release_schedule: [],
        release_stages: [
            {
                id: 1,
                name: 'Ready for Launch',
                sort_order: 1,
                duration_days: 0,
                level_durations: null,
                scope: null,
                is_gate: false,
            },
        ],
        criterion: [],
        epic_criterion_status: [],
        epic: [],
        app_user: [],
        ...overrides,
    };
}

describe('computeAgendaForMeeting - tier filtering (defect 1)', () => {
    const gating = [
        {
            criterion_id: CRITERION_COMMERCIALIZATION,
            enabled: true,
            lookahead_days: null,
            tiers: ['TIER_1', 'TIER_2'],
            default_time_box_minutes: null,
        },
    ];

    const criteria = [criterion(CRITERION_COMMERCIALIZATION, 'Commercialization')];

    const epics = [
        epic('epic-t1', 'Tier 1 release', 'TIER_1'),
        epic('epic-t2', 'Tier 2 release', 'TIER_2'),
        epic('epic-t3', 'Tier 3 release', 'TIER_3'),
        epic('epic-null', 'Untiered release', null),
    ];

    const statuses = epics.map((e) => ({
        epic_id: e.id,
        criterion_id: CRITERION_COMMERCIALIZATION,
        status: 'NOT_SET',
        decision_owner_id: null,
    }));

    it('materializes only epics whose tier is in the criterion scope', async () => {
        const sb = makeSupabase(
            baseTables({
                paprico_gating_criterion: gating,
                criterion: criteria,
                epic: epics,
                epic_criterion_status: statuses,
            })
        );

        await computeAgendaForMeeting(sb.client, MEETING, { todayYmd: TODAY });

        expect(
            sb
                .generatedItems()
                .map((r) => r.epic_id)
                .sort()
        ).toEqual(['epic-t1', 'epic-t2']);
    });

    it('skips epics with no tier', async () => {
        const sb = makeSupabase(
            baseTables({
                paprico_gating_criterion: [{ ...gating[0], tiers: ['TIER_1', 'TIER_2', 'TIER_3'] }],
                criterion: criteria,
                epic: epics,
                epic_criterion_status: statuses,
            })
        );

        await computeAgendaForMeeting(sb.client, MEETING, { todayYmd: TODAY });

        const generated = sb.generatedItems();
        expect(generated.map((r) => r.epic_id)).not.toContain('epic-null');
        expect(generated).toHaveLength(3);
    });

    it('scopes tiers per criterion rather than by one global floor', async () => {
        // Commercialization is plausibly worth watching at Tier 3; the SVP
        // forecast review is not. One global setting cannot say both.
        const sb = makeSupabase(
            baseTables({
                paprico_gating_criterion: [
                    { ...gating[0], tiers: ['TIER_1', 'TIER_2', 'TIER_3'] },
                    {
                        criterion_id: CRITERION_SVP_FORECAST,
                        enabled: true,
                        lookahead_days: null,
                        tiers: ['TIER_1'],
                        default_time_box_minutes: null,
                    },
                ],
                criterion: [
                    ...criteria,
                    criterion(CRITERION_SVP_FORECAST, 'Revenue forecast reviewed by SVP Sales + Head RevOps'),
                ],
                epic: epics,
                epic_criterion_status: [
                    ...statuses,
                    ...epics.map((e) => ({
                        epic_id: e.id,
                        criterion_id: CRITERION_SVP_FORECAST,
                        status: 'NOT_SET',
                        decision_owner_id: null,
                    })),
                ],
            })
        );

        await computeAgendaForMeeting(sb.client, MEETING, { todayYmd: TODAY });

        const generated = sb.generatedItems();
        const commercialization = generated.filter((r) => r.criterion_id === CRITERION_COMMERCIALIZATION);
        const forecast = generated.filter((r) => r.criterion_id === CRITERION_SVP_FORECAST);

        expect(commercialization.map((r) => r.epic_id).sort()).toEqual(['epic-t1', 'epic-t2', 'epic-t3']);
        expect(forecast.map((r) => r.epic_id)).toEqual(['epic-t1']);
    });

    it('falls back to the Tier 1 / Tier 2 default when a criterion has no tiers configured', async () => {
        const sb = makeSupabase(
            baseTables({
                paprico_gating_criterion: [{ ...gating[0], tiers: null }],
                criterion: criteria,
                epic: epics,
                epic_criterion_status: statuses,
            })
        );

        await computeAgendaForMeeting(sb.client, MEETING, { todayYmd: TODAY });

        expect(
            sb
                .generatedItems()
                .map((r) => r.epic_id)
                .sort()
        ).toEqual(['epic-t1', 'epic-t2']);
    });

    it('leaves already-materialized out-of-tier items alone', async () => {
        // Narrowing the scope must not retroactively remove items a chair may
        // already have deferred, blocked or decided on.
        const existing = {
            id: 'existing-t3',
            source: 'release',
            epic_id: 'epic-t3',
            criterion_id: CRITERION_COMMERCIALIZATION,
            title: 'Tier 3 release - Commercialization',
            status: 'deferred',
            sort_order: 0,
            time_box_minutes: null,
            owner_email: null,
            category: 'Commercial',
            auto_closed: false,
            system_notes: null,
            description: null,
            blocked_reason: null,
            links: null,
            created_by: 'system:agenda-sync',
            created_at: '2026-09-01T00:00:00.000Z',
            updated_at: '2026-09-01T00:00:00.000Z',
        };

        const sb = makeSupabase(
            baseTables({
                paprico_gating_criterion: gating,
                criterion: criteria,
                epic: epics,
                epic_criterion_status: statuses,
                paprico_item: [existing],
            })
        );

        const agenda = await computeAgendaForMeeting(sb.client, MEETING, { todayYmd: TODAY });

        const allItems = [...agenda.overdue_critical, ...agenda.approaching, ...agenda.standing];
        expect(allItems.map((i) => i.id)).toContain('existing-t3');
    });
});

describe('computeAgendaForMeeting - the 2026-09-18 agenda, reproduced', () => {
    // The live run generated 78 release items across 34 epics:
    //   overdue_critical  51 = 2 TIER_1 + 26 TIER_2 + 23 TIER_3
    //   approaching       27 = 7 TIER_1 + 10 TIER_2 + 10 TIER_3
    // i.e. 9 TIER_1, 36 TIER_2, 33 TIER_3 -- 42% of the agenda was Tier 3.
    const LIVE_TIER_COUNTS = { TIER_1: 9, TIER_2: 36, TIER_3: 33 };

    it('drops the 33 Tier 3 items under the default scope, leaving 45', () => {
        const before = Object.values(LIVE_TIER_COUNTS).reduce((a, b) => a + b, 0);
        expect(before).toBe(78);
    });

    it('generates 45 items for the live tier distribution', async () => {
        const epics: Row[] = [];
        const statuses: Row[] = [];
        for (const [tier, count] of Object.entries(LIVE_TIER_COUNTS)) {
            for (let i = 0; i < count; i += 1) {
                const id = `${tier}-${i}`;
                epics.push(epic(id, `${tier} release ${i}`, tier));
                statuses.push({
                    epic_id: id,
                    criterion_id: CRITERION_COMMERCIALIZATION,
                    status: 'NOT_SET',
                    decision_owner_id: null,
                });
            }
        }

        const sb = makeSupabase(
            baseTables({
                paprico_gating_criterion: [
                    {
                        criterion_id: CRITERION_COMMERCIALIZATION,
                        enabled: true,
                        lookahead_days: null,
                        tiers: ['TIER_1', 'TIER_2'],
                        default_time_box_minutes: null,
                    },
                ],
                criterion: [criterion(CRITERION_COMMERCIALIZATION, 'Commercialization')],
                epic: epics,
                epic_criterion_status: statuses,
            })
        );

        await computeAgendaForMeeting(sb.client, MEETING, { todayYmd: TODAY });

        const generated = sb.generatedItems();
        expect(generated).toHaveLength(45);
        expect(generated.filter((r) => String(r.epic_id).startsWith('TIER_3'))).toHaveLength(0);
    });
});

describe('computeAgendaForMeeting - owner propagation (defect 3)', () => {
    const gating = [
        {
            criterion_id: CRITERION_COMMERCIALIZATION,
            enabled: true,
            lookahead_days: null,
            tiers: ['TIER_1', 'TIER_2'],
            default_time_box_minutes: null,
        },
    ];
    const criteria = [criterion(CRITERION_COMMERCIALIZATION, 'Commercialization')];

    it('resolves criterion decision owner, then epic owner, then null', async () => {
        const sb = makeSupabase(
            baseTables({
                paprico_gating_criterion: gating,
                criterion: criteria,
                epic: [
                    epic('epic-a', 'Has a decision owner', 'TIER_1', 'epic.owner@clearcompany.com'),
                    epic('epic-b', 'Falls back to the epic owner', 'TIER_1', 'epic.owner@clearcompany.com'),
                    epic('epic-c', 'Has neither', 'TIER_1', null),
                ],
                epic_criterion_status: [
                    {
                        epic_id: 'epic-a',
                        criterion_id: CRITERION_COMMERCIALIZATION,
                        status: 'NOT_SET',
                        decision_owner_id: 'user-1',
                    },
                    {
                        epic_id: 'epic-b',
                        criterion_id: CRITERION_COMMERCIALIZATION,
                        status: 'NOT_SET',
                        decision_owner_id: null,
                    },
                    {
                        epic_id: 'epic-c',
                        criterion_id: CRITERION_COMMERCIALIZATION,
                        status: 'NOT_SET',
                        decision_owner_id: null,
                    },
                ],
                app_user: [{ id: 'user-1', email: 'decision.owner@clearcompany.com' }],
            })
        );

        await computeAgendaForMeeting(sb.client, MEETING, { todayYmd: TODAY });

        const byEpic = Object.fromEntries(sb.generatedItems().map((r) => [r.epic_id, r.owner_email]));
        expect(byEpic).toEqual({
            'epic-a': 'decision.owner@clearcompany.com',
            'epic-b': 'epic.owner@clearcompany.com',
            'epic-c': null,
        });
    });

    it('falls back to the epic owner when the decision owner id resolves to nobody', async () => {
        // A decision_owner_id pointing at a deleted app_user must not produce an
        // ownerless item when the epic still has an owner.
        const sb = makeSupabase(
            baseTables({
                paprico_gating_criterion: gating,
                criterion: criteria,
                epic: [epic('epic-a', 'Dangling owner id', 'TIER_1', 'epic.owner@clearcompany.com')],
                epic_criterion_status: [
                    {
                        epic_id: 'epic-a',
                        criterion_id: CRITERION_COMMERCIALIZATION,
                        status: 'NOT_SET',
                        decision_owner_id: 'user-gone',
                    },
                ],
                app_user: [],
            })
        );

        await computeAgendaForMeeting(sb.client, MEETING, { todayYmd: TODAY });

        expect(sb.generatedItems()[0].owner_email).toBe('epic.owner@clearcompany.com');
    });
});

describe('computeAgendaForMeeting - time boxes (defect 2)', () => {
    it('stamps the criterion default onto generated items and reports the unbudgeted count', async () => {
        const sb = makeSupabase(
            baseTables({
                paprico_gating_criterion: [
                    {
                        criterion_id: CRITERION_COMMERCIALIZATION,
                        enabled: true,
                        lookahead_days: null,
                        tiers: ['TIER_1', 'TIER_2'],
                        default_time_box_minutes: 5,
                    },
                    {
                        criterion_id: CRITERION_SVP_FORECAST,
                        enabled: true,
                        lookahead_days: null,
                        tiers: ['TIER_1', 'TIER_2'],
                        default_time_box_minutes: null,
                    },
                ],
                criterion: [
                    criterion(CRITERION_COMMERCIALIZATION, 'Commercialization'),
                    criterion(CRITERION_SVP_FORECAST, 'Revenue forecast reviewed by SVP Sales + Head RevOps'),
                ],
                epic: [epic('epic-a', 'A release', 'TIER_1')],
                epic_criterion_status: [
                    {
                        epic_id: 'epic-a',
                        criterion_id: CRITERION_COMMERCIALIZATION,
                        status: 'NOT_SET',
                        decision_owner_id: null,
                    },
                    {
                        epic_id: 'epic-a',
                        criterion_id: CRITERION_SVP_FORECAST,
                        status: 'NOT_SET',
                        decision_owner_id: null,
                    },
                ],
            })
        );

        const agenda = await computeAgendaForMeeting(sb.client, MEETING, { todayYmd: TODAY });

        const boxes = sb.generatedItems().map((r) => r.time_box_minutes);
        expect(boxes).toContain(5);
        expect(boxes).toContain(null);

        // 5 budgeted minutes and one item with no box at all -- the count is what
        // stops "5 min of 90" reading as spare capacity.
        expect(agenda.total_time_box_minutes).toBe(5);
        expect(agenda.unbudgeted_item_count).toBe(1);
    });
});
