import { describe, it, expect } from '@jest/globals';
import {
    dedupeCriteriaForNotifications,
    filterIncompleteCriteriaForNotifications,
    isCriterionCompleteForNotifications,
} from '../criteriaNotificationFilters';

describe('criteriaNotificationFilters', () => {
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
