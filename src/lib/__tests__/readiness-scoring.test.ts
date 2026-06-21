/**
 * Tests for the new readiness scoring algorithm
 * Covers signoff rules, category scoring, gating logic, and verdict determination
 */

import { describe, it, expect } from '@jest/globals';
import {
  computeLaunchReadiness,
  isSignoffCriterion,
  normalizeStatus,
  type CriterionInput,
} from '../readiness-scoring';

describe('Readiness Scoring Algorithm', () => {
  describe('Signoff override behavior', () => {
    it('should treat all criteria as GO when signoff is GO', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: true,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NO_GO',
          isGating: false,
        },
        {
          id: '3',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NOT_SET',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // All criteria should be treated as GO due to signoff
      expect(result.categoryScores[0].score).toBeGreaterThan(0.9);
      expect(result.verdict).toBe('GO');
    });

    it('should not apply signoff override when signoff is not GO', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: true,
          status: 'NO_GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // Should not override - score should reflect actual statuses
      expect(result.categoryScores[0].score).toBeLessThan(1.0);
    });

    it('should only apply signoff within the same category', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: true,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NO_GO',
          isGating: false,
        },
        {
          id: '3',
          categoryId: 'category2',
          isSignoff: false,
          status: 'NO_GO',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // Category1 should have high score (signoff override)
      // Category2 should have low score (no signoff)
      expect(result.categoryScores.length).toBe(2);
      const cat1 = result.categoryScores.find(c => c.categoryId === 'category1');
      const cat2 = result.categoryScores.find(c => c.categoryId === 'category2');
      expect(cat1!.score).toBeGreaterThan(cat2!.score);
    });
  });

  describe('Category score calculation with gating caps', () => {
    it('should apply NO_GO_GATING_CAP when gating criterion is NO_GO', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: true,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NO_GO',
          isGating: true, // Gating NO_GO
        },
        {
          id: '3',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // Score should be capped at 0.60 (NO_GO_GATING_CAP)
      expect(result.categoryScores[0].score).toBeLessThanOrEqual(0.60);
      expect(result.categoryScores[0].hasGatingNoGo).toBe(true);
    });

    it('should apply CONDITIONAL_GATING_CAP when gating criterion is CONDITIONAL_GO', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'CONDITIONAL_GO',
          isGating: true, // Gating CONDITIONAL
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // Score should be capped at 0.85 (CONDITIONAL_GATING_CAP)
      expect(result.categoryScores[0].score).toBeLessThanOrEqual(0.85);
    });

    it('should block (treat as NO_GO) when a gating criterion is unvoted and enforcement is on (GTM Access phase+)', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NOT_SET',
          isGating: true, // Gating NOT_SET — no vote on a gate
        },
      ];

      const result = computeLaunchReadiness(criteria, { enforceUnvotedGatesAsNoGo: true });

      // With enforcement on, an unvoted gate is as hard as a NO_GO: caps at 0.60 and blocks.
      expect(result.categoryScores[0].score).toBeLessThanOrEqual(0.60);
      expect(result.categoryScores[0].hasGatingUnvoted).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.verdict).toBe('NO_GO_BLOCKED_BY_GATING');
    });

    it('should force an AT_RISK ceiling (not block) for an unvoted gate before the GTM Access phase (default)', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NOT_SET',
          isGating: true, // Gating NOT_SET — no vote on a gate
        },
      ];

      // Default (no options) == pre-phase behavior.
      const result = computeLaunchReadiness(criteria);

      // Pre-phase: caps at the NOT_SET cap (0.75), does NOT block, but verdict is AT_RISK.
      expect(result.categoryScores[0].score).toBeLessThanOrEqual(0.75);
      expect(result.categoryScores[0].hasGatingUnvoted).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.verdict).toBe('AT_RISK');
    });

    it('should NOT block when a gating criterion is NOT_APPLICABLE (only caps)', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NOT_APPLICABLE',
          isGating: true, // N/A is an explicit choice, not a missing vote
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // N/A gate caps at 0.75 but does not block.
      expect(result.categoryScores[0].score).toBeLessThanOrEqual(0.75);
      expect(result.categoryScores[0].hasGatingUnvoted).toBe(false);
      expect(result.blocked).toBe(false);
      expect(result.verdict).not.toBe('NO_GO_BLOCKED_BY_GATING');
    });

    it('should apply ANY_NOT_SET_CAP when any criterion is NOT_SET', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NOT_SET',
          isGating: false, // Not gating, but still NOT_SET
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // Score should be capped at 0.95 (ANY_NOT_SET_CAP)
      expect(result.categoryScores[0].score).toBeLessThanOrEqual(0.95);
      expect(result.categoryScores[0].hasAnyNotSet).toBe(true);
    });
  });

  describe('Verdict determination', () => {
    it('should return NO_GO_BLOCKED_BY_GATING when blocked by gating criterion', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NO_GO',
          isGating: true,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      expect(result.verdict).toBe('NO_GO_BLOCKED_BY_GATING');
      expect(result.blocked).toBe(true);
    });

    it('should return GO when readiness >= 0.9 and not blocked', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      expect(result.verdict).toBe('GO');
      expect(result.readiness).toBeGreaterThanOrEqual(0.9);
    });

    it('should return CONDITIONAL_GO when 0.7 <= readiness < 0.9', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'CONDITIONAL_GO',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      expect(result.verdict).toBe('CONDITIONAL_GO');
      expect(result.readiness).toBeGreaterThanOrEqual(0.7);
      expect(result.readiness).toBeLessThan(0.9);
    });

    it('should return AT_RISK when readiness < 0.7', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NO_GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'CONDITIONAL_GO',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      expect(result.verdict).toBe('AT_RISK');
      expect(result.readiness).toBeLessThan(0.7);
    });

    it('should return NOT_EVALUATED when no criteria', () => {
      const criteria: CriterionInput[] = [];

      const result = computeLaunchReadiness(criteria);

      expect(result.verdict).toBe('NOT_EVALUATED');
      expect(result.readiness).toBe(0);
      expect(result.readinessPct).toBe(0);
    });
  });

  describe('Weight calculations with gating multiplier', () => {
    it('should apply GATING_WEIGHT_MULTIPLIER to gating criteria', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: true, // Gating - weight should be 3x
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false, // Non-gating - weight is 1x
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // Gating criterion should have 3x weight
      // Both are GO, so score should be high but gating has more influence
      expect(result.categoryScores[0].score).toBeGreaterThan(0.9);
    });

    it('should respect custom weights', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
          weight: 2, // Custom weight
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
          weight: 1,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // Both GO, but first has 2x weight
      expect(result.categoryScores[0].score).toBeGreaterThan(0.9);
    });

    it('should combine custom weights with gating multiplier', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: true,
          weight: 2, // Should be 2 * 3 = 6x effective weight
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
          weight: 1,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // Gating criterion with custom weight should dominate
      expect(result.categoryScores[0].score).toBeGreaterThan(0.9);
    });
  });

  describe('Category fairness (equal weight per category)', () => {
    it('should average category scores equally', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category2',
          isSignoff: false,
          status: 'NO_GO',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // Should average the two categories
      expect(result.categoryScores.length).toBe(2);
      expect(result.readiness).toBeGreaterThan(0);
      expect(result.readiness).toBeLessThan(1);
    });

    it('should handle multiple categories with different scores', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
        {
          id: '3',
          categoryId: 'category2',
          isSignoff: false,
          status: 'CONDITIONAL_GO',
          isGating: false,
        },
        {
          id: '4',
          categoryId: 'category3',
          isSignoff: false,
          status: 'NO_GO',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      expect(result.categoryScores.length).toBe(3);
      // Overall readiness should be average of three categories
      expect(result.readiness).toBeGreaterThan(0);
      expect(result.readiness).toBeLessThan(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty criteria list', () => {
      const criteria: CriterionInput[] = [];
      const result = computeLaunchReadiness(criteria);

      expect(result.verdict).toBe('NOT_EVALUATED');
      expect(result.readiness).toBe(0);
      expect(result.readinessPct).toBe(0);
      expect(result.blocked).toBe(false);
      expect(result.categoryScores).toEqual([]);
    });

    it('should handle all gates', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: true,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: true,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // Should still calculate score (gates are weighted 3x)
      expect(result.categoryScores[0].score).toBeGreaterThan(0);
    });

    it('should handle all NOT_SET', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NOT_SET',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NOT_SET',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // NOT_SET scores 0, so overall should be 0
      expect(result.categoryScores[0].score).toBe(0);
      expect(result.readiness).toBe(0);
    });

    it('should handle mixed statuses', () => {
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
        {
          id: '2',
          categoryId: 'category1',
          isSignoff: false,
          status: 'CONDITIONAL_GO',
          isGating: false,
        },
        {
          id: '3',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NO_GO',
          isGating: false,
        },
        {
          id: '4',
          categoryId: 'category1',
          isSignoff: false,
          status: 'NOT_SET',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      // Should calculate weighted average
      expect(result.categoryScores[0].score).toBeGreaterThan(0);
      expect(result.categoryScores[0].score).toBeLessThan(1);
      expect(result.categoryScores[0].hasAnyNotSet).toBe(true);
    });

    it('should handle category with no criteria', () => {
      // This shouldn't happen in practice, but test the edge case
      const criteria: CriterionInput[] = [
        {
          id: '1',
          categoryId: 'category1',
          isSignoff: false,
          status: 'GO',
          isGating: false,
        },
      ];

      const result = computeLaunchReadiness(criteria);

      expect(result.categoryScores.length).toBe(1);
      expect(result.categoryScores[0].categoryId).toBe('category1');
    });
  });

  describe('isSignoffCriterion', () => {
    it('should detect signoff in label (case-insensitive)', () => {
      expect(isSignoffCriterion('Product Signoff')).toBe(true);
      expect(isSignoffCriterion('SIGNOFF Required')).toBe(true);
      expect(isSignoffCriterion('signoff')).toBe(true);
      expect(isSignoffCriterion('SIGNOFF')).toBe(true);
    });

    it('should return false for non-signoff labels', () => {
      expect(isSignoffCriterion('Product Review')).toBe(false);
      expect(isSignoffCriterion('Approval')).toBe(false);
      expect(isSignoffCriterion(null)).toBe(false);
      expect(isSignoffCriterion(undefined)).toBe(false);
      expect(isSignoffCriterion('')).toBe(false);
    });
  });

  describe('normalizeStatus', () => {
    it('should normalize status strings correctly', () => {
      expect(normalizeStatus('GO')).toBe('GO');
      expect(normalizeStatus('go')).toBe('GO');
      expect(normalizeStatus('  GO  ')).toBe('GO');
      expect(normalizeStatus('NO_GO')).toBe('NO_GO');
      expect(normalizeStatus('no_go')).toBe('NO_GO');
      expect(normalizeStatus('CONDITIONAL')).toBe('CONDITIONAL_GO');
      expect(normalizeStatus('CONDITIONAL_GO')).toBe('CONDITIONAL_GO');
      expect(normalizeStatus('NOT_SET')).toBe('NOT_SET');
    });

    it('should return NOT_SET for invalid or null status', () => {
      expect(normalizeStatus(null)).toBe('NOT_SET');
      expect(normalizeStatus(undefined)).toBe('NOT_SET');
      expect(normalizeStatus('')).toBe('NOT_SET');
      expect(normalizeStatus('INVALID')).toBe('NOT_SET');
    });
  });
});
