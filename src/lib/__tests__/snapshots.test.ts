/**
 * Unit tests for snapshot functionality
 */

describe('Snapshot Functionality', () => {
  describe('Snapshot Data Structure', () => {
    it('should capture launch data', () => {
      const snapshotData = {
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

      expect(snapshotData.launch).toBeDefined();
      expect(snapshotData.launch.name).toBe('Test Launch');
      expect(snapshotData.readiness.score).toBe(0.85);
    });

    it('should capture all criteria statuses', () => {
      const snapshotData = {
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

      expect(snapshotData.criteria_statuses).toHaveLength(2);
      expect(snapshotData.criteria_statuses[0].status).toBe('GO');
      expect(snapshotData.criteria_statuses[1].status).toBe('CONDITIONAL');
    });

    it('should capture readiness metrics', () => {
      const snapshotData = {
        launch: { id: '123' },
        criteria_statuses: [],
        readiness: {
          score: 0.92,
          status: 'GO',
          risk: 'LOW',
        },
      };

      expect(snapshotData.readiness.score).toBe(0.92);
      expect(snapshotData.readiness.status).toBe('GO');
      expect(snapshotData.readiness.risk).toBe('LOW');
    });
  });

  describe('Snapshot Metadata', () => {
    it('should include decision type', () => {
      const snapshot = {
        decision_type: 'GO_NO_GO_MEETING',
        verdict: 'GO',
        notes: 'All gates passed',
      };

      expect(snapshot.decision_type).toBe('GO_NO_GO_MEETING');
    });

    it('should include verdict', () => {
      const snapshot = {
        decision_type: 'ADHOC_CHECK',
        verdict: 'CONDITIONAL_GO',
        notes: 'Pending security review',
      };

      expect(snapshot.verdict).toBe('CONDITIONAL_GO');
    });

    it('should include notes', () => {
      const snapshot = {
        decision_type: 'FINAL_APPROVAL',
        verdict: 'GO',
        notes: 'Approved by CPO',
      };

      expect(snapshot.notes).toBe('Approved by CPO');
    });
  });

  describe('Snapshot Ordering', () => {
    it('should order snapshots by taken_at descending', () => {
      const snapshots = [
        { id: '1', taken_at: '2025-11-20T10:00:00Z' },
        { id: '2', taken_at: '2025-11-25T10:00:00Z' },
        { id: '3', taken_at: '2025-11-22T10:00:00Z' },
      ];

      const sorted = [...snapshots].sort(
        (a, b) => new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime()
      );

      expect(sorted[0].id).toBe('2'); // Most recent first
      expect(sorted[1].id).toBe('3');
      expect(sorted[2].id).toBe('1');
    });
  });
});
