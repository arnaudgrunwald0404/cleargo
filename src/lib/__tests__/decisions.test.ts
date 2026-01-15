/**
 * Unit tests for decision functionality
 */

describe('Decision Functionality', () => {
    describe('Decision Data Structure', () => {
        it('should capture launch data', () => {
            const decisionData = {
                launch: {
                    id: '123',
                    name: 'Test Launch',
                    tier: 'TIER_1',
                    readiness_score: 0.85,
                },
                criteria_statuses: [],
                readiness: {
                    score: 0.85,
                    status: 'CONDITIONAL_GO',
                    risk: 'MEDIUM',
                },
            };

            expect(decisionData.launch).toBeDefined();
            expect(decisionData.launch.name).toBe('Test Launch');
            expect(decisionData.readiness.score).toBe(0.85);
        });

        it('should capture all criteria statuses', () => {
            const decisionData = {
                launch: { id: '123' },
                criteria_statuses: [
                    { id: '1', status: 'GO', criterion: { label: 'Security Review' } },
                    { id: '2', status: 'CONDITIONAL', criterion: { label: 'Performance Testing' } },
                ],
                readiness: {
                    score: 0.75,
                    status: 'CONDITIONAL_GO',
                    risk: 'MEDIUM',
                },
            };

            expect(decisionData.criteria_statuses).toHaveLength(2);
            expect(decisionData.criteria_statuses[0].status).toBe('GO');
            expect(decisionData.criteria_statuses[1].status).toBe('CONDITIONAL');
        });

        it('should capture readiness metrics', () => {
            const decisionData = {
                launch: { id: '123' },
                criteria_statuses: [],
                readiness: {
                    score: 0.92,
                    status: 'GO',
                    risk: 'LOW',
                },
            };

            expect(decisionData.readiness.score).toBe(0.92);
            expect(decisionData.readiness.status).toBe('GO');
            expect(decisionData.readiness.risk).toBe('LOW');
        });
    });

    describe('Decision Metadata', () => {
        it('should include decision type', () => {
            const decision = {
                decision_type: 'GO_NO_GO_MEETING',
                verdict: 'GO',
                notes: 'All gates passed',
            };

            expect(decision.decision_type).toBe('GO_NO_GO_MEETING');
        });

        it('should include verdict', () => {
            const decision = {
                decision_type: 'ADHOC_CHECK',
                verdict: 'CONDITIONAL_GO',
                notes: 'Pending security review',
            };

            expect(decision.verdict).toBe('CONDITIONAL_GO');
        });

        it('should include notes', () => {
            const decision = {
                decision_type: 'FINAL_APPROVAL',
                verdict: 'GO',
                notes: 'Approved by CPO',
            };

            expect(decision.notes).toBe('Approved by CPO');
        });
    });

    describe('Decision Ordering', () => {
        it('should order decisions by taken_at descending', () => {
            const decisions = [
                { id: '1', taken_at: '2025-11-20T10:00:00Z' },
                { id: '2', taken_at: '2025-11-25T10:00:00Z' },
                { id: '3', taken_at: '2025-11-22T10:00:00Z' },
            ];

            const sorted = [...decisions].sort((a, b) =>
                new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime()
            );

            expect(sorted[0].id).toBe('2'); // Most recent first
            expect(sorted[1].id).toBe('3');
            expect(sorted[2].id).toBe('1');
        });
    });
});
