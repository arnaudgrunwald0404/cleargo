import { buildMinutesMarkdown, buildSlackAgendaBlock } from '../format';
import type { AgendaItem, OpenCommitment, PapricoAgenda, PapricoDecision, PapricoMeeting } from '../types';

function meeting(overrides: Partial<PapricoMeeting> = {}): PapricoMeeting {
    return {
        id: 'm1',
        meeting_date: '2026-08-25',
        chair_email: 'chair@clearcompany.com',
        status: 'held',
        meeting_length_minutes: 60,
        agenda_published_at: null,
        agenda_snapshot: null,
        notes: null,
        created_by: null,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
        ...overrides,
    };
}

function agendaItem(overrides: Partial<AgendaItem>): AgendaItem {
    return {
        id: 'i1',
        source: 'release',
        epic_id: 'e1',
        criterion_id: 'c1',
        title: 'AI Notetaker — Packaging & Pricing Approved',
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
        epic_name: 'AI Notetaker',
        release_name: 'Release 2026.9',
        tier: 'TIER_1',
        criterion_label: 'Packaging & Pricing Approved',
        stage_name: 'Product Definition Complete',
        stage_date: '2026-09-04',
        days_to_stage: 10,
        band: 'critical',
        orphaned: false,
        decision_count: 0,
        ...overrides,
    };
}

function commitment(overrides: Partial<OpenCommitment> = {}): OpenCommitment {
    return {
        id: 'd1',
        item_id: 'i1',
        meeting_id: 'm0',
        decision_type: 'assigned',
        decision_text: 'Right-size the free grant to 25 credits',
        rationale: null,
        owner_email: 'owner@clearcompany.com',
        due_date: '2026-08-10',
        completed_at: null,
        completed_by: null,
        supersedes_id: null,
        decided_by: 'chair@clearcompany.com',
        decided_at: '2026-07-20T00:00:00Z',
        item_title: 'AI Notetaker — Packaging & Pricing Approved',
        age_days: 14,
        ...overrides,
    };
}

function emptyAgenda(overrides: Partial<PapricoAgenda> = {}): PapricoAgenda {
    return {
        computed_at: '2026-08-24T00:00:00Z',
        today: '2026-08-24',
        open_commitments: [],
        overdue_critical: [],
        approaching: [],
        standing: [],
        total_time_box_minutes: 0,
        ...overrides,
    };
}

describe('buildSlackAgendaBlock', () => {
    it('renders all four sections in order with the spec empty state', () => {
        const block = buildSlackAgendaBlock(meeting(), emptyAgenda());
        const idx = (s: string) => block.indexOf(s);
        expect(idx('*1. Open commitments*')).toBeGreaterThan(-1);
        expect(idx('*1. Open commitments*')).toBeLessThan(idx('*2. Overdue and critical*'));
        expect(idx('*2. Overdue and critical*')).toBeLessThan(idx('*3. Approaching*'));
        expect(idx('*3. Approaching*')).toBeLessThan(idx('*4. Standing items*'));
        expect(block).toContain('Nothing approaching a stage with pricing, naming or forecast criteria open.');
    });

    it('renders items with band label, owner and overdue commitments with age', () => {
        const block = buildSlackAgendaBlock(
            meeting(),
            emptyAgenda({
                open_commitments: [commitment()],
                overdue_critical: [agendaItem({ owner_email: 'pm@clearcompany.com', time_box_minutes: 10 })],
                total_time_box_minutes: 10,
            })
        );
        expect(block).toContain('AI Notetaker — Packaging & Pricing Approved');
        expect(block).toContain('CRITICAL');
        expect(block).toContain('owner: pm@clearcompany.com');
        expect(block).toContain('14d overdue');
        expect(block).toContain('Time boxed: 10 min of 60 min');
    });
});

describe('buildMinutesMarkdown', () => {
    const decision: PapricoDecision & { item_title?: string | null } = {
        id: 'd2',
        item_id: 'i1',
        meeting_id: 'm1',
        decision_type: 'approved',
        decision_text: 'Approved the 25-credit grant',
        rationale: 'Seven months of typical use',
        owner_email: 'owner@clearcompany.com',
        due_date: '2026-09-15',
        completed_at: null,
        completed_by: null,
        supersedes_id: 'd1',
        decided_by: 'chair@clearcompany.com',
        decided_at: '2026-08-25T18:00:00Z',
        item_title: 'AI Notetaker — Packaging & Pricing Approved',
    };

    it('lists every decision with owner and due date (acceptance #12)', () => {
        const md = buildMinutesMarkdown({
            meeting: meeting(),
            decisions: [decision],
            deferredItems: [],
            blockedItems: [],
            openCommitments: [],
        });
        expect(md).toContain('# PaPriCo minutes');
        expect(md).toContain('AI Notetaker — Packaging & Pricing Approved');
        expect(md).toContain('`approved`');
        expect(md).toContain('Owner: owner@clearcompany.com');
        expect(md).toContain('Rationale: Seven months of typical use');
        expect(md).toContain('Supersedes an earlier decision (d1)');
    });

    it('renders deferred (with why), blocked (with what) and still-open commitments', () => {
        const md = buildMinutesMarkdown({
            meeting: meeting(),
            decisions: [],
            deferredItems: [{ title: 'Legacy credit conversion', reason: 'Waiting on finance model' }],
            blockedItems: [{ title: 'Discount enforcement', blocked_reason: 'SFDC catalogue cleanup' }],
            openCommitments: [commitment()],
        });
        expect(md).toContain('Legacy credit conversion — Waiting on finance model');
        expect(md).toContain('Discount enforcement — blocked on: SFDC catalogue cleanup');
        expect(md).toContain('Commitments still open');
        expect(md).toContain('owner@clearcompany.com');
    });

    it('uses explicit empty states rather than blanks', () => {
        const md = buildMinutesMarkdown({
            meeting: meeting(),
            decisions: [],
            deferredItems: [],
            blockedItems: [],
            openCommitments: [],
        });
        expect(md).toContain('_No decisions recorded._');
        expect(md).toContain('_Nothing deferred._');
        expect(md).toContain('_Nothing blocked._');
    });
});
