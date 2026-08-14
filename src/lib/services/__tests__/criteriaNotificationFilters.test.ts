import { describe, it, expect } from '@jest/globals';
import {
    dedupeCriteriaForNotifications,
    filterIncompleteCriteriaForNotifications,
    isCriterionCompleteForNotifications,
    isConditionalConfirmationDue,
    isConditionalStatus,
    isOverdueNudgeDue,
    overdueNudgeIntervalDays,
} from '../criteriaNotificationFilters';

describe('criteriaNotificationFilters', () => {
    describe('isConditionalStatus', () => {
        it('recognises both spellings and nothing else', () => {
            expect(isConditionalStatus('CONDITIONAL')).toBe(true);
            expect(isConditionalStatus('CONDITIONAL_GO')).toBe(true);
            expect(isConditionalStatus('conditional')).toBe(true);
            expect(isConditionalStatus('GO')).toBe(false);
            expect(isConditionalStatus('NOT_SET')).toBe(false);
            expect(isConditionalStatus(null)).toBe(false);
        });
    });

    describe('isConditionalConfirmationDue', () => {
        const today = '2026-08-14';

        it('stays quiet while launch is still far off, however overdue the item is', () => {
            expect(isConditionalConfirmationDue({ last_nudge_sent_at: null }, today, 60)).toBe(false);
            expect(isConditionalConfirmationDue({ last_nudge_sent_at: null }, today, 15)).toBe(false);
        });

        it('asks for confirmation once launch is inside the pre-launch window', () => {
            expect(isConditionalConfirmationDue({ last_nudge_sent_at: null }, today, 14)).toBe(true);
            expect(isConditionalConfirmationDue({ last_nudge_sent_at: null }, today, 1)).toBe(true);
            expect(isConditionalConfirmationDue({ last_nudge_sent_at: null }, today, 0)).toBe(true);
        });

        it('re-asks weekly rather than daily inside the window', () => {
            expect(isConditionalConfirmationDue({ last_nudge_sent_at: '2026-08-13' }, today, 10)).toBe(false);
            expect(isConditionalConfirmationDue({ last_nudge_sent_at: '2026-08-08' }, today, 10)).toBe(false);
            expect(isConditionalConfirmationDue({ last_nudge_sent_at: '2026-08-07' }, today, 10)).toBe(true);
        });

        it('stays quiet when there is no launch date to confirm against', () => {
            expect(isConditionalConfirmationDue({ last_nudge_sent_at: null }, today, null)).toBe(false);
        });

        it('defers to the past-release rules once launch has passed', () => {
            expect(isConditionalConfirmationDue({ last_nudge_sent_at: null }, today, -1)).toBe(false);
        });
    });
    describe('overdueNudgeIntervalDays', () => {
        it('nudges daily through the first week overdue', () => {
            expect(overdueNudgeIntervalDays(1)).toBe(1);
            expect(overdueNudgeIntervalDays(7)).toBe(1);
        });

        it('backs off to weekly, then fortnightly, as the item ages', () => {
            expect(overdueNudgeIntervalDays(8)).toBe(7);
            expect(overdueNudgeIntervalDays(30)).toBe(7);
            expect(overdueNudgeIntervalDays(31)).toBe(14);
            expect(overdueNudgeIntervalDays(365)).toBe(14);
        });
    });

    describe('isOverdueNudgeDue', () => {
        const today = '2026-08-14';

        it('always sends when the item has never been nudged', () => {
            expect(isOverdueNudgeDue({ condition_due_date: '2026-01-01', last_nudge_sent_at: null }, today)).toBe(true);
        });

        it('sends daily while an item is freshly overdue', () => {
            // 3 days overdue, nudged yesterday -> interval is 1 day, so due again
            expect(isOverdueNudgeDue({ condition_due_date: '2026-08-11', last_nudge_sent_at: '2026-08-13' }, today)).toBe(true);
        });

        it('suppresses a 44-day-overdue item nudged 3 days ago (the CLEARGO-I-22 case)', () => {
            expect(isOverdueNudgeDue({ condition_due_date: '2026-07-01', last_nudge_sent_at: '2026-08-11' }, today)).toBe(false);
        });

        it('sends again once the fortnightly interval has elapsed', () => {
            expect(isOverdueNudgeDue({ condition_due_date: '2026-07-01', last_nudge_sent_at: '2026-07-31' }, today)).toBe(true);
        });

        it('suppresses a mid-aged item inside its weekly window but sends after it', () => {
            // 20 days overdue -> weekly. Nudged 2 days ago: hold. Nudged 8 days ago: send.
            expect(isOverdueNudgeDue({ condition_due_date: '2026-07-25', last_nudge_sent_at: '2026-08-12' }, today)).toBe(false);
            expect(isOverdueNudgeDue({ condition_due_date: '2026-07-25', last_nudge_sent_at: '2026-08-06' }, today)).toBe(true);
        });

        it('defers to the other nudge windows when the item is not actually overdue', () => {
            expect(isOverdueNudgeDue({ condition_due_date: '2026-08-20', last_nudge_sent_at: '2026-08-13' }, today)).toBe(true);
        });

        it('sends when the due date is missing or unparseable', () => {
            expect(isOverdueNudgeDue({ condition_due_date: null, last_nudge_sent_at: '2026-08-13' }, today)).toBe(true);
            expect(isOverdueNudgeDue({ condition_due_date: 'not-a-date', last_nudge_sent_at: '2026-08-13' }, today)).toBe(true);
        });
    });
    describe('isCriterionCompleteForNotifications', () => {
        it('treats GO, NO_GO, and NOT_APPLICABLE as complete', () => {
            expect(isCriterionCompleteForNotifications('GO')).toBe(true);
            expect(isCriterionCompleteForNotifications('NO_GO')).toBe(true);
            expect(isCriterionCompleteForNotifications('NOT_APPLICABLE')).toBe(true);
            expect(isCriterionCompleteForNotifications('N/A')).toBe(true);
        });

        it('treats NOT_SET and CONDITIONAL as incomplete', () => {
            expect(isCriterionCompleteForNotifications('NOT_SET')).toBe(false);
            expect(isCriterionCompleteForNotifications('CONDITIONAL')).toBe(false);
            expect(isCriterionCompleteForNotifications('CONDITIONAL_GO')).toBe(false);
        });
    });

    describe('dedupeCriteriaForNotifications', () => {
        it('prefers the GO row when duplicates exist for the same epic and criterion', () => {
            const epicId = 'epic-1';
            const criterionId = 'crit-1';
            const result = dedupeCriteriaForNotifications([
                {
                    id: 'row-not-set',
                    epic_id: epicId,
                    criterion_id: criterionId,
                    status: 'NOT_SET',
                    last_updated_at: '2026-06-01T12:00:00Z',
                },
                {
                    id: 'row-go',
                    epic_id: epicId,
                    criterion_id: criterionId,
                    status: 'GO',
                    last_updated_at: '2026-06-01T10:00:00Z',
                },
            ]);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('row-go');
            expect(result[0].status).toBe('GO');
        });

        it('keeps the most recently updated row when both are incomplete', () => {
            const epicId = 'epic-2';
            const criterionId = 'crit-2';
            const result = dedupeCriteriaForNotifications([
                {
                    id: 'older',
                    epic_id: epicId,
                    criterion_id: criterionId,
                    status: 'NOT_SET',
                    last_updated_at: '2026-05-01T00:00:00Z',
                },
                {
                    id: 'newer',
                    epic_id: epicId,
                    criterion_id: criterionId,
                    status: 'CONDITIONAL',
                    last_updated_at: '2026-06-01T00:00:00Z',
                },
            ]);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('newer');
        });
    });

    describe('filterIncompleteCriteriaForNotifications', () => {
        it('removes completed statuses after query', () => {
            const filtered = filterIncompleteCriteriaForNotifications([
                { id: '1', epic_id: 'e1', criterion_id: 'c1', status: 'GO' },
                { id: '2', epic_id: 'e1', criterion_id: 'c2', status: 'NOT_SET' },
            ]);
            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe('2');
        });
    });
});
