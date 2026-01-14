/**
 * Tests for risk assessment calculation logic
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { assessEpicRisk, identifyHighRiskEpics } from '../risk-assessment';
import { createMockSupabaseClient } from './test-utils';

// Mock dependencies
jest.mock('../supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('../settings-db', () => ({
  getSettings: jest.fn().mockResolvedValue({
    threshold_tier1: 0.9,
    threshold_tier2: 0.8,
    threshold_tier3: 0.7,
  }),
}));

describe('assessEpicRisk', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = require('../supabase/server');
    createClient.mockReturnValue(mockSupabase);
  });

  describe('Risk score calculation with all factors', () => {
    it('should calculate risk score for epic with all risk factors', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days
        readiness_score: 0.5, // Below threshold
        readiness_status: 'NO_GO',
        risk_level: 'HIGH',
      };

      // Mock criteria statuses with gate blockers and overdue items
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              status: 'NO_GO',
              criterion: { gate: true },
              condition_due_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // Overdue
            },
            {
              status: 'NOT_SET',
              criterion: { gate: false },
              condition_due_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // Overdue
            },
          ],
          error: null,
        }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.riskScore).toBeGreaterThan(50);
      expect(result.riskReasons.length).toBeGreaterThan(0);
      expect(result.hasGateBlockers).toBe(true);
      expect(result.overdueCriteriaCount).toBe(2);
    });

    it('should calculate low risk score for healthy epic', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
        readiness_score: 0.95, // Above threshold
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              status: 'GO',
              criterion: { gate: true },
            },
          ],
          error: null,
        }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.riskScore).toBeLessThan(50);
      expect(result.hasGateBlockers).toBe(false);
      expect(result.overdueCriteriaCount).toBe(0);
    });
  });

  describe('Days to launch calculations', () => {
    it('should add maximum points for launch date in past', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        readiness_score: 0.9,
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.daysToLaunch).toBeLessThan(0);
      expect(result.riskReasons).toContain('Launch date has passed');
      expect(result.riskScore).toBeGreaterThanOrEqual(40);
    });

    it('should add high points for launch within 7 days', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days
        readiness_score: 0.9,
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.daysToLaunch).toBe(5);
      expect(result.riskReasons.some(r => r.includes('Launching in 5 days'))).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(40);
    });

    it('should add moderate points for launch within 14 days', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days
        readiness_score: 0.9,
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.daysToLaunch).toBe(10);
      expect(result.riskScore).toBeGreaterThanOrEqual(30);
    });

    it('should handle missing launch date', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: null,
        readiness_score: 0.9,
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.daysToLaunch).toBeNull();
      // Should not add days-to-launch points
      expect(result.riskScore).toBeLessThan(40);
    });
  });

  describe('Gate blockers detection', () => {
    it('should detect gate blockers', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.9,
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              status: 'NO_GO',
              criterion: { gate: true }, // Gate blocker
            },
          ],
          error: null,
        }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.hasGateBlockers).toBe(true);
      expect(result.riskReasons).toContain('Has gate criteria with NO_GO status');
      expect(result.riskScore).toBeGreaterThanOrEqual(30);
    });

    it('should not flag non-gating NO_GO as blocker', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.9,
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              status: 'NO_GO',
              criterion: { gate: false }, // Not a gate
            },
          ],
          error: null,
        }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.hasGateBlockers).toBe(false);
    });
  });

  describe('Overdue criteria counting', () => {
    it('should count overdue criteria', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.9,
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              status: 'NOT_SET',
              criterion: { gate: false },
              condition_due_date: pastDate, // Overdue
            },
            {
              status: 'CONDITIONAL',
              criterion: { gate: false },
              condition_due_date: pastDate, // Overdue
            },
            {
              status: 'GO',
              criterion: { gate: false },
              condition_due_date: pastDate, // Not overdue (status is complete)
            },
          ],
          error: null,
        }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.overdueCriteriaCount).toBe(2);
      expect(result.riskReasons.some(r => r.includes('2 overdue criteria'))).toBe(true);
    });

    it('should not count future due dates as overdue', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.9,
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              status: 'NOT_SET',
              criterion: { gate: false },
              condition_due_date: futureDate, // Not overdue
            },
          ],
          error: null,
        }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.overdueCriteriaCount).toBe(0);
    });
  });

  describe('Readiness status factor', () => {
    it('should add points for NO_GO status', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.9,
        readiness_status: 'NO_GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.riskReasons).toContain('Readiness status is NO_GO');
      expect(result.riskScore).toBeGreaterThanOrEqual(30);
    });

    it('should add points for CONDITIONAL status', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.9,
        readiness_status: 'CONDITIONAL_GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.riskReasons).toContain('Readiness status is CONDITIONAL');
      expect(result.riskScore).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Readiness score vs threshold', () => {
    it('should add points when score is below threshold', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.5, // Below TIER_1 threshold of 0.9
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.riskReasons.some(r => r.includes('below threshold'))).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(20);
    });

    it('should not add points when score is above threshold', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.95, // Above TIER_1 threshold of 0.9
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.riskReasons.some(r => r.includes('below threshold'))).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle missing dates', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: null,
        readiness_score: null,
        readiness_status: null,
        risk_level: null,
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.daysToLaunch).toBeNull();
      expect(result.readinessScore).toBeNull();
      expect(result.riskScore).toBeDefined();
    });

    it('should cap risk score at 100', async () => {
      const epic = {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // Past
        readiness_score: 0.1, // Very low
        readiness_status: 'NO_GO',
        risk_level: 'HIGH',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              status: 'NO_GO',
              criterion: { gate: true },
            },
            {
              status: 'NOT_SET',
              criterion: { gate: false },
              condition_due_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            },
          ],
          error: null,
        }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should handle missing tier (defaults to TIER_3)', async () => {
      const epic = {
        id: 'epic-1',
        tier: null,
        target_launch_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.9,
        readiness_status: 'GO',
        risk_level: 'LOW',
      };

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await assessEpicRisk(epic);

      expect(result.tier).toBe('TIER_3');
    });
  });
});

describe('identifyHighRiskEpics', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = require('../supabase/server');
    createClient.mockReturnValue(mockSupabase);
  });

  it('should filter to epics with risk score >= 50', async () => {
    const epics = [
      {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.5,
        readiness_status: 'NO_GO',
        risk_level: 'HIGH',
      },
      {
        id: 'epic-2',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.95,
        readiness_status: 'GO',
        risk_level: 'LOW',
      },
    ];

    // Mock criteria for both epics
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    const result = await identifyHighRiskEpics(epics);

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('epic-1');
    expect(result[0].riskScore).toBeGreaterThanOrEqual(50);
  });

  it('should sort by risk score descending', async () => {
    const epics = [
      {
        id: 'epic-1',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.5,
        readiness_status: 'NO_GO',
        risk_level: 'HIGH',
      },
      {
        id: 'epic-2',
        tier: 'TIER_1',
        target_launch_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        readiness_score: 0.6,
        readiness_status: 'CONDITIONAL_GO',
        risk_level: 'MEDIUM',
      },
    ];

    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    const result = await identifyHighRiskEpics(epics);

    expect(result.length).toBe(2);
    expect(result[0].riskScore).toBeGreaterThanOrEqual(result[1].riskScore);
  });
});
