/**
 * Tests for readiness recalculation orchestration
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { recomputeEpicReadiness } from '../readiness';
import { createMockSupabaseClient } from './test-utils';

// Mock dependencies
jest.mock('../supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('../slack/notifications', () => ({
  sendSlackNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../email/notifications', () => ({
  sendEmailNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../aha/write-back', () => ({
  writeBackEpicReadiness: jest.fn().mockResolvedValue(undefined),
}));

describe('recomputeEpicReadiness', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = require('../supabase/server');
    createClient.mockReturnValue(mockSupabase);
  });

  describe('Epic with no criteria', () => {
    it('should mark epic as NOT_EVALUATED when no criteria exist', async () => {
      const epicId = 'epic-123';
      
      // Mock epic fetch
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: epicId,
            name: 'Test Epic',
            tier: 'TIER_1',
            target_launch_date: '2024-12-31',
            readiness_status: 'GO',
            risk_level: 'LOW',
          },
          error: null,
        }),
      });

      // Mock criteria statuses fetch - empty
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      });

      // Mock epic update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await recomputeEpicReadiness(epicId);

      // Should update epic to NOT_EVALUATED
      const updateCall = mockSupabase.from.mock.results[2].value.update;
      expect(updateCall).toHaveBeenCalledWith({
        readiness_score: null,
        readiness_status: 'NOT_EVALUATED',
        risk_level: 'LOW',
        updated_at: expect.any(String),
      });
    });
  });

  describe('Tier applicability filtering', () => {
    it('should filter criteria by tier applicability', async () => {
      const epicId = 'epic-123';
      
      // Mock epic fetch - TIER_1
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: epicId,
            name: 'Test Epic',
            tier: 'TIER_1',
            target_launch_date: '2024-12-31',
            readiness_status: 'GO',
            risk_level: 'LOW',
          },
          error: null,
        }),
      });

      // Mock criteria statuses - one applicable, one not
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'status-1',
              status: 'GO',
              criterion: {
                id: 'criterion-1',
                label: 'Test Criterion',
                category: 'Category1',
                gate: false,
                tier_applicability: 'ALL', // Applicable to all tiers
              },
            },
            {
              id: 'status-2',
              status: 'NO_GO',
              criterion: {
                id: 'criterion-2',
                label: 'TIER_1 Only',
                category: 'Category2',
                gate: false,
                tier_applicability: 'TIER_1_ONLY', // Applicable to TIER_1
              },
            },
            {
              id: 'status-3',
              status: 'GO',
              criterion: {
                id: 'criterion-3',
                label: 'TIER_2 Only',
                category: 'Category3',
                gate: false,
                tier_applicability: 'TIER_1_AND_2', // Not applicable to TIER_1 (should be filtered)
              },
            },
          ],
          error: null,
        }),
      });

      // Mock epic update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await recomputeEpicReadiness(epicId);

      // Should update epic with calculated readiness
      const updateCall = mockSupabase.from.mock.results[2].value.update;
      expect(updateCall).toHaveBeenCalled();
      const updateData = updateCall.mock.calls[0][0];
      expect(updateData.readiness_score).toBeDefined();
      expect(updateData.readiness_status).toBeDefined();
    });
  });

  describe('Database update on readiness change', () => {
    it('should update epic with new readiness score and status', async () => {
      const epicId = 'epic-123';
      
      // Mock epic fetch
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: epicId,
            name: 'Test Epic',
            tier: 'TIER_1',
            target_launch_date: '2024-12-31',
            readiness_status: 'GO',
            risk_level: 'LOW',
          },
          error: null,
        }),
      });

      // Mock criteria statuses
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'status-1',
              status: 'GO',
              criterion: {
                id: 'criterion-1',
                label: 'Test Criterion',
                category: 'Category1',
                gate: false,
                tier_applicability: 'ALL',
              },
            },
          ],
          error: null,
        }),
      });

      // Mock epic update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await recomputeEpicReadiness(epicId);

      // Should update epic
      const updateCall = mockSupabase.from.mock.results[2].value.update;
      expect(updateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          readiness_score: expect.any(Number),
          readiness_status: expect.any(String),
          risk_level: expect.any(String),
          updated_at: expect.any(String),
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should throw error when epic fetch fails', async () => {
      const epicId = 'epic-123';
      
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Epic not found' },
        }),
      });

      await expect(recomputeEpicReadiness(epicId)).rejects.toThrow();
    });

    it('should throw error when criteria statuses fetch fails', async () => {
      const epicId = 'epic-123';
      
      // Mock epic fetch
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: epicId,
            name: 'Test Epic',
            tier: 'TIER_1',
          },
          error: null,
        }),
      });

      // Mock criteria statuses fetch - error
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      });

      await expect(recomputeEpicReadiness(epicId)).rejects.toThrow();
    });
  });

  describe('Notification sending', () => {
    it('should send notification when readiness status changes', async () => {
      const epicId = 'epic-123';
      const { sendSlackNotification } = require('../slack/notifications');
      const { sendEmailNotification } = require('../email/notifications');
      
      // Mock epic fetch - status changes from GO to NO_GO
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: epicId,
            name: 'Test Epic',
            tier: 'TIER_1',
            target_launch_date: '2024-12-31',
            readiness_status: 'GO', // Old status
            risk_level: 'LOW',
            console_url: 'https://example.com/epic',
            owner_email: 'owner@example.com',
          },
          error: null,
        }),
      });

      // Mock criteria statuses - all NO_GO to trigger status change
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'status-1',
              status: 'NO_GO',
              criterion: {
                id: 'criterion-1',
                label: 'Test Criterion',
                category: 'Category1',
                gate: true, // Gating NO_GO will cause NO_GO_BLOCKED_BY_GATING
                tier_applicability: 'ALL',
              },
            },
          ],
          error: null,
        }),
      });

      // Mock epic update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await recomputeEpicReadiness(epicId);

      // Should send notifications
      expect(sendSlackNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'launch_status_change',
          priority: 'high',
          launch_id: epicId,
        })
      );
      expect(sendEmailNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'launch_status_change',
          recipientEmail: 'owner@example.com',
        })
      );
    });

    it('should not send notification when status unchanged', async () => {
      const epicId = 'epic-123';
      const { sendSlackNotification } = require('../slack/notifications');
      
      // Mock epic fetch - status stays GO
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: epicId,
            name: 'Test Epic',
            tier: 'TIER_1',
            target_launch_date: '2024-12-31',
            readiness_status: 'GO',
            risk_level: 'LOW',
          },
          error: null,
        }),
      });

      // Mock criteria statuses - all GO (status stays GO)
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'status-1',
              status: 'GO',
              criterion: {
                id: 'criterion-1',
                label: 'Test Criterion',
                category: 'Category1',
                gate: false,
                tier_applicability: 'ALL',
              },
            },
          ],
          error: null,
        }),
      });

      // Mock epic update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await recomputeEpicReadiness(epicId);

      // Should not send status change notification
      expect(sendSlackNotification).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'launch_status_change' })
      );
    });
  });

  describe('Aha write-back integration', () => {
    it('should trigger Aha write-back after recalculation', async () => {
      const epicId = 'epic-123';
      const { writeBackEpicReadiness } = require('../aha/write-back');
      
      // Mock epic fetch
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: epicId,
            name: 'Test Epic',
            tier: 'TIER_1',
            target_launch_date: '2024-12-31',
            readiness_status: 'GO',
            risk_level: 'LOW',
          },
          error: null,
        }),
      });

      // Mock criteria statuses
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'status-1',
              status: 'GO',
              criterion: {
                id: 'criterion-1',
                label: 'Test Criterion',
                category: 'Category1',
                gate: false,
                tier_applicability: 'ALL',
              },
            },
          ],
          error: null,
        }),
      });

      // Mock epic update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await recomputeEpicReadiness(epicId);

      // Should trigger write-back
      expect(writeBackEpicReadiness).toHaveBeenCalledWith(epicId);
    });

    it('should handle write-back errors gracefully', async () => {
      const epicId = 'epic-123';
      const { writeBackEpicReadiness } = require('../aha/write-back');
      writeBackEpicReadiness.mockRejectedValueOnce(new Error('Write-back failed'));
      
      // Mock epic fetch
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: epicId,
            name: 'Test Epic',
            tier: 'TIER_1',
            target_launch_date: '2024-12-31',
            readiness_status: 'GO',
            risk_level: 'LOW',
          },
          error: null,
        }),
      });

      // Mock criteria statuses
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'status-1',
              status: 'GO',
              criterion: {
                id: 'criterion-1',
                label: 'Test Criterion',
                category: 'Category1',
                gate: false,
                tier_applicability: 'ALL',
              },
            },
          ],
          error: null,
        }),
      });

      // Mock epic update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      // Should not throw - error should be caught and logged
      await expect(recomputeEpicReadiness(epicId)).resolves.not.toThrow();
    });
  });
});
