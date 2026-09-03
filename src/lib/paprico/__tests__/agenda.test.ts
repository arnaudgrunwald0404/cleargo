import {
    appendSystemNote,
    autoCloseNote,
    commitmentAgeDays,
    compareAgendaItems,
    composeReleaseItemTitle,
    computeUrgencyBand,
    isCriterionStatusComplete,
    isOpenCommitment,
    isWithinLookahead,
    sectionForItem,
    totalTimeBoxMinutes,
    validateDecisionInput,
} from '../agenda';
import type { AgendaItem } from '../types';

describe('isCriterionStatusComplete', () => {
    it('treats GO and NOT_APPLICABLE as complete', () => {
        expect(isCriterionStatusComplete('GO')).toBe(true);
        expect(isCriterionStatusComplete('NOT_APPLICABLE')).toBe(true);
    });

    it('keeps CONDITIONAL_GO, NO_GO and NOT_SET open', () => {
        expect(isCriterionStatusComplete('CONDITIONAL_GO')).toBe(false);
        expect(isCriterionStatusComplete('NO_GO')).toBe(false);
        expect(isCriterionStatusComplete('NOT_SET')).toBe(false);
        expect(isCriterionStatusComplete(null)).toBe(false);
    });
});

describe('computeUrgencyBand', () => {
    it('bands by days to stage date', () => {
        expect(computeUrgencyBand(-1)).toBe('overdue');
        expect(computeUrgencyBand(0)).toBe('critical');
        expect(computeUrgencyBand(10)).toBe('critical');
        expect(computeUrgencyBand(14)).toBe('critical');
        expect(computeUrgencyBand(15)).toBe('soon');
        expect(computeUrgencyBand(30)).toBe('soon');
        expect(computeUrgencyBand(31)).toBe('horizon');
        expect(computeUrgencyBand(45)).toBe('horizon');
    });

    it('returns null with no date', () => {
        expect(computeUrgencyBand(null)).toBeNull();
    });
});

describe('isWithinLookahead', () => {
    it('includes stage dates inside the horizon of the meeting date', () => {
        // Acceptance #2: date 45 days out with default 60-day lookahead is included.
        expect(isWithinLookahead('2026-10-08', '2026-08-24', 60)).toBe(true);
    });

    it('includes past stage dates (they band as overdue)', () => {
        expect(isWithinLookahead('2026-08-01', '2026-08-24', 60)).toBe(true);
    });

    it('excludes stage dates beyond the horizon', () => {
        expect(isWithinLookahead('2026-12-01', '2026-08-24', 60)).toBe(false);
    });

    it('excludes pairs with no computable stage date', () => {
        expect(isWithinLookahead(null, '2026-08-24', 60)).toBe(false);
    });
});

function agendaItem(overrides: Partial<AgendaItem>): AgendaItem {
    return {
        id: 'i1',
        source: 'release',
        epic_id: 'e1',
        criterion_id: 'c1',
        title: 'Epic — Criterion',
        description: null,
        category: null,
        owner_email: null,
        status: 'proposed',
        blocked_reason: null,
        time_box_minutes: null,
        sort_order: 0,
        auto_closed: false,
        system_notes: null,
        links: null,
        created_by: null,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
        epic_name: 'Epic',
        release_name: null,
        tier: null,
        criterion_label: 'Criterion',
        stage_name: null,
        stage_date: null,
        days_to_stage: null,
        band: null,
        orphaned: false,
        decision_count: 0,
        ...overrides,
    };
}

describe('sectionForItem', () => {
    it('routes overdue and critical release items to overdue_critical', () => {
        expect(sectionForItem(agendaItem({ band: 'overdue' }))).toBe('overdue_critical');
        // Acceptance #3: 10 days out => critical => Overdue and critical section.
        expect(sectionForItem(agendaItem({ band: 'critical' }))).toBe('overdue_critical');
    });

    it('routes soon/horizon release items to approaching', () => {
        // Acceptance #2: 45 days out => horizon => Approaching.
        expect(sectionForItem(agendaItem({ band: 'horizon' }))).toBe('approaching');
        expect(sectionForItem(agendaItem({ band: 'soon' }))).toBe('approaching');
    });

    it('routes orphaned/dateless release items to approaching, never dropping them', () => {
        expect(sectionForItem(agendaItem({ band: null }))).toBe('approaching');
    });

    it('always routes standing items to standing regardless of band', () => {
        // Acceptance #5: standing items never disappear from Standing items.
        expect(sectionForItem(agendaItem({ source: 'standing', band: null }))).toBe('standing');
    });
});

describe('compareAgendaItems', () => {
    it('sorts band, then stage date ascending, then tier', () => {
        const items = [
            agendaItem({ id: 'a', band: 'horizon', stage_date: '2026-10-01', tier: 'TIER_1' }),
            agendaItem({ id: 'b', band: 'overdue', stage_date: '2026-08-01', tier: 'TIER_2' }),
            agendaItem({ id: 'c', band: 'critical', stage_date: '2026-09-01', tier: 'TIER_2' }),
            agendaItem({ id: 'd', band: 'critical', stage_date: '2026-08-30', tier: 'TIER_1' }),
            agendaItem({ id: 'e', band: 'critical', stage_date: '2026-09-01', tier: 'TIER_1' }),
        ];
        const sorted = [...items].sort(compareAgendaItems).map((i) => i.id);
        expect(sorted).toEqual(['b', 'd', 'e', 'c', 'a']);
    });

    it('puts dateless items last within a band group', () => {
        const items = [
            agendaItem({ id: 'a', band: null, stage_date: null }),
            agendaItem({ id: 'b', band: 'horizon', stage_date: '2026-10-01' }),
        ];
        expect([...items].sort(compareAgendaItems).map((i) => i.id)).toEqual(['b', 'a']);
    });
});

describe('composeReleaseItemTitle', () => {
    it('joins epic and criterion', () => {
        expect(composeReleaseItemTitle('AI Notetaker', 'Packaging & Pricing Approved')).toBe(
            'AI Notetaker — Packaging & Pricing Approved'
        );
    });

    it('survives missing names (orphan resilience)', () => {
        expect(composeReleaseItemTitle(null, null)).toBe('Unknown release — Unknown criterion');
    });
});

describe('validateDecisionInput', () => {
    it('requires a decision type and decision text', () => {
        expect(validateDecisionInput({})).toMatch(/decision type/i);
        expect(validateDecisionInput({ decision_type: 'rejected' })).toMatch(/text/i);
        expect(validateDecisionInput({ decision_type: 'bogus', decision_text: 'x' })).toMatch(/decision type/i);
    });

    it('requires an owner for assigned/approved/approved_with_amendment', () => {
        // Acceptance #7: an assigned decision cannot be saved without an owner and due date.
        expect(validateDecisionInput({ decision_type: 'assigned', decision_text: 'Do it' })).toMatch(/owner/i);
        expect(validateDecisionInput({ decision_type: 'approved', decision_text: 'Ship it' })).toMatch(/owner/i);
        expect(
            validateDecisionInput({ decision_type: 'approved_with_amendment', decision_text: 'Ship, tweaked' })
        ).toMatch(/owner/i);
    });

    it('requires a due date whenever an owner is set', () => {
        expect(
            validateDecisionInput({
                decision_type: 'assigned',
                decision_text: 'Do it',
                owner_email: 'own@clearcompany.com',
            })
        ).toMatch(/due date/i);
    });

    it('passes a complete assigned decision', () => {
        expect(
            validateDecisionInput({
                decision_type: 'assigned',
                decision_text: 'Do it',
                owner_email: 'own@clearcompany.com',
                due_date: '2026-09-15',
            })
        ).toBeNull();
    });

    it('passes rejected/deferred/no_decision_needed without an owner', () => {
        expect(validateDecisionInput({ decision_type: 'rejected', decision_text: 'No' })).toBeNull();
        expect(validateDecisionInput({ decision_type: 'deferred', decision_text: 'Next month' })).toBeNull();
        expect(validateDecisionInput({ decision_type: 'no_decision_needed', decision_text: 'FYI only' })).toBeNull();
    });
});

describe('open commitments', () => {
    it('surfaces incomplete decisions with a past due date on every agenda', () => {
        // Acceptance #10.
        expect(
            isOpenCommitment(
                { owner_email: 'o@x.com', due_date: '2026-08-01', completed_at: null },
                '2026-08-24'
            )
        ).toBe(true);
    });

    it('surfaces decisions due within 14 days but not beyond', () => {
        expect(
            isOpenCommitment(
                { owner_email: 'o@x.com', due_date: '2026-09-07', completed_at: null },
                '2026-08-24'
            )
        ).toBe(true);
        expect(
            isOpenCommitment(
                { owner_email: 'o@x.com', due_date: '2026-09-08', completed_at: null },
                '2026-08-24'
            )
        ).toBe(false);
    });

    it('excludes completed decisions and ownerless/dateless rows', () => {
        expect(
            isOpenCommitment(
                { owner_email: 'o@x.com', due_date: '2026-08-01', completed_at: '2026-08-10T00:00:00Z' },
                '2026-08-24'
            )
        ).toBe(false);
        expect(isOpenCommitment({ owner_email: null, due_date: '2026-08-01', completed_at: null }, '2026-08-24')).toBe(false);
        expect(isOpenCommitment({ owner_email: 'o@x.com', due_date: null, completed_at: null }, '2026-08-24')).toBe(false);
    });

    it('computes age in days past due', () => {
        expect(commitmentAgeDays('2026-08-01', '2026-08-24')).toBe(23);
        expect(commitmentAgeDays('2026-08-30', '2026-08-24')).toBe(-6);
    });
});

describe('system notes and time boxes', () => {
    it('appends the auto-close note to existing notes', () => {
        const note = autoCloseNote('2026-08-24');
        expect(note).toContain('2026-08-24');
        expect(appendSystemNote(null, note)).toBe(note);
        expect(appendSystemNote('earlier note', note)).toBe(`earlier note\n${note}`);
    });

    it('totals time-boxed minutes ignoring unset boxes', () => {
        expect(
            totalTimeBoxMinutes([
                { time_box_minutes: 10 },
                { time_box_minutes: null },
                { time_box_minutes: 15 },
            ])
        ).toBe(25);
    });
});
