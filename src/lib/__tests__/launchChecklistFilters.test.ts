import {
    anyLaunchChecklistFilterActive,
    filterLaunchChecklistRows,
    rowIsDueSoon,
    rowIsMine,
    rowIsOverdue,
    DUE_SOON_WINDOW_DAYS,
    NO_LAUNCH_CHECKLIST_FILTERS,
    type FilterableChecklistRow,
    type LaunchChecklistContext,
} from '../launchChecklistFilters';

const TODAY = '2026-08-27';
const ME = 'me@clearcompany.com';

/**
 * TIER_2, GA 2026-11-01. The seeded T2 offsets put the runway well inside the
 * launch record's lifetime, so nothing here is compressed unless a test says so.
 */
const CTX: LaunchChecklistContext = {
    targetLaunchDate: '2026-11-01',
    tier: 'TIER_2',
    launchCreatedAt: '2026-01-01',
    currentUserEmail: ME,
    today: TODAY,
};

function row(over: Partial<FilterableChecklistRow> = {}): FilterableChecklistRow {
    return {
        status: 'NOT_STARTED',
        owner_email: null,
        due_date: null,
        criterion: { default_due_offset_days: null, tier_offset_days: null },
        ...over,
    };
}

/** A row whose stored due date is `due`, with a start 14 days ahead of it. */
function dated(due: string, over: Partial<FilterableChecklistRow> = {}): FilterableChecklistRow {
    return row({ due_date: due, ...over });
}

describe('rowIsMine', () => {
    it('matches the row owner, case-insensitively', () => {
        expect(rowIsMine(row({ owner_email: 'ME@ClearCompany.com' }), ME)).toBe(true);
        expect(rowIsMine(row({ owner_email: 'someone@else.com' }), ME)).toBe(false);
    });

    it('matches an item owner even when the gate row is unassigned', () => {
        // The reason this exists: gates are owned per function, so most of a
        // person's work hangs off items under an unassigned gate.
        const gate = row({
            owner_email: null,
            items: [
                { owner_email: 'someone@else.com', status: 'NOT_STARTED' },
                { owner_email: ME, status: 'NOT_STARTED' },
            ],
        });
        expect(rowIsMine(gate, ME)).toBe(true);
    });

    it('is false for everyone when no user is known', () => {
        expect(rowIsMine(row({ owner_email: ME }), null)).toBe(false);
        expect(rowIsMine(row({ owner_email: ME }), undefined)).toBe(false);
    });
});

describe('rowIsOverdue', () => {
    it('is true past the due date', () => {
        expect(rowIsOverdue(dated('2026-08-01'), CTX)).toBe(true);
    });

    it('is false on and before the due date', () => {
        expect(rowIsOverdue(dated(TODAY), CTX)).toBe(false);
        expect(rowIsOverdue(dated('2026-09-30'), CTX)).toBe(false);
    });

    it('is false for closed rows however old the date', () => {
        expect(rowIsOverdue(dated('2026-01-05', { status: 'DONE' }), CTX)).toBe(false);
        expect(rowIsOverdue(dated('2026-01-05', { status: 'NOT_APPLICABLE' }), CTX)).toBe(false);
    });

    it('is false with no date at all', () => {
        expect(rowIsOverdue(row(), CTX)).toBe(false);
    });

    it('keeps a compressed row out of Overdue while its granted window is open', () => {
        // Launch created 2026-08-20 for a GA 8 days out: the T2 runway needed
        // months, so the window closed before the record existed. It reads
        // compressed, not late, until the re-granted window runs out.
        const compressedCtx: LaunchChecklistContext = {
            ...CTX,
            targetLaunchDate: '2026-09-04',
            launchCreatedAt: '2026-08-20',
        };
        const artifact = dated('2026-06-01', {
            criterion: { default_due_offset_days: 35, tier_offset_days: { TIER_2: 35 } },
        });
        expect(rowIsOverdue(artifact, compressedCtx)).toBe(false);
    });

    it('calls a compressed row overdue once its granted window has closed', () => {
        // Same shape, but the launch appeared long enough ago that the minimum
        // grace has expired.
        const staleCtx: LaunchChecklistContext = {
            ...CTX,
            targetLaunchDate: '2026-09-04',
            launchCreatedAt: '2026-06-01',
        };
        const artifact = dated('2026-05-01', {
            criterion: { default_due_offset_days: 35, tier_offset_days: { TIER_2: 35 } },
        });
        expect(rowIsOverdue(artifact, staleCtx)).toBe(true);
    });
});

describe('rowIsDueSoon', () => {
    it('includes today and the far edge of the window', () => {
        expect(rowIsDueSoon(dated(TODAY), CTX)).toBe(true);
        expect(rowIsDueSoon(dated('2026-09-10'), CTX)).toBe(true); // TODAY + 14
    });

    it('excludes the day after the window and anything already past', () => {
        expect(rowIsDueSoon(dated('2026-09-11'), CTX)).toBe(false);
        expect(rowIsDueSoon(dated('2026-08-26'), CTX)).toBe(false);
    });

    it('excludes closed rows and undated rows', () => {
        expect(rowIsDueSoon(dated('2026-09-01', { status: 'DONE' }), CTX)).toBe(false);
        expect(rowIsDueSoon(row(), CTX)).toBe(false);
    });

    it('uses a 14-day horizon', () => {
        expect(DUE_SOON_WINDOW_DAYS).toBe(14);
    });
});

describe('filterLaunchChecklistRows', () => {
    const mine = dated('2026-09-01', { owner_email: ME });
    const minePast = dated('2026-07-01', { owner_email: ME });
    const theirs = dated('2026-09-01', { owner_email: 'someone@else.com' });
    const theirsPast = dated('2026-07-01', { owner_email: 'someone@else.com' });
    const all = [mine, minePast, theirs, theirsPast];

    it('returns every row untouched when nothing is on', () => {
        expect(filterLaunchChecklistRows(all, NO_LAUNCH_CHECKLIST_FILTERS, CTX)).toBe(all);
    });

    it('narrows to my rows', () => {
        expect(
            filterLaunchChecklistRows(all, { myTasks: true, overdue: false, dueSoon: false }, CTX)
        ).toEqual([mine, minePast]);
    });

    it('ORs Overdue with Due soon', () => {
        expect(
            filterLaunchChecklistRows(all, { myTasks: false, overdue: true, dueSoon: true }, CTX)
        ).toEqual(all);
        expect(
            filterLaunchChecklistRows(all, { myTasks: false, overdue: true, dueSoon: false }, CTX)
        ).toEqual([minePast, theirsPast]);
    });

    it('ANDs My tasks with the date chips', () => {
        expect(
            filterLaunchChecklistRows(all, { myTasks: true, overdue: true, dueSoon: false }, CTX)
        ).toEqual([minePast]);
    });

    it('reports whether anything is on', () => {
        expect(anyLaunchChecklistFilterActive(NO_LAUNCH_CHECKLIST_FILTERS)).toBe(false);
        expect(
            anyLaunchChecklistFilterActive({ myTasks: false, overdue: false, dueSoon: true })
        ).toBe(true);
    });
});
