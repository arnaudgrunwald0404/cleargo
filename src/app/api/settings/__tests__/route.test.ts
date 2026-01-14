/**
 * Tests for settings update API route
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET, PATCH } from '../route';
import { createMockSupabaseClient, createMockRequest } from '../../../../lib/__tests__/test-utils';

// Mock dependencies
jest.mock('../../../../lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('../../../../lib/api-auth', () => ({
  getAuthenticatedUserEmail: jest.fn().mockResolvedValue('user@example.com'),
}));

jest.mock('../../../../lib/settings-db', () => ({
  getSettings: jest.fn().mockResolvedValue({
    id: 'settings-1',
    threshold_tier1: 0.9,
    threshold_tier2: 0.8,
    threshold_tier3: 0.7,
  }),
  updateSettings: jest.fn().mockImplementation((updates) => ({
    id: 'settings-1',
    ...updates,
  })),
}));

jest.mock('../../../../lib/permissions', () => ({
  canRolesPerform: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../../lib/debug', () => ({
  debugLog: jest.fn(),
}));

describe('GET /api/settings', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = require('../../../../lib/supabase/server');
    createClient.mockReturnValue(mockSupabase);
  });

  it('should return settings for authorized user', async () => {
    const req = createMockRequest();

    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { roles: ['PRODUCT_OPS'] },
        error: null,
      }),
    });

    const response = await GET(req);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.threshold_tier1).toBe(0.9);
  });

  it('should return 401 when user is not authenticated', async () => {
    const { getAuthenticatedUserEmail } = require('../../../../lib/api-auth');
    getAuthenticatedUserEmail.mockResolvedValueOnce(null);

    const req = createMockRequest();
    const response = await GET(req);

    expect(response.status).toBe(401);
  });

  it('should return 404 when user profile not found', async () => {
    const req = createMockRequest();

    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      }),
    });

    const response = await GET(req);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('User profile not found');
  });

  it('should return 403 when user lacks settings.read permission', async () => {
    const { canRolesPerform } = require('../../../../lib/permissions');
    canRolesPerform.mockResolvedValueOnce(false);

    const req = createMockRequest();

    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { roles: ['OTHER'] },
        error: null,
      }),
    });

    const response = await GET(req);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain('Forbidden');
  });
});

describe('PATCH /api/settings', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = require('../../../../lib/supabase/server');
    createClient.mockReturnValue(mockSupabase);
  });

  describe('Settings validation', () => {
    it('should update settings successfully', async () => {
      const req = createMockRequest({
        body: {
          threshold_tier1: 0.95,
          threshold_tier2: 0.85,
        },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PRODUCT_OPS'] },
          error: null,
        }),
      });

      const response = await PATCH(req);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.threshold_tier1).toBe(0.95);
      expect(body.threshold_tier2).toBe(0.85);
    });

    it('should handle aha_fields_to_load updates', async () => {
      const req = createMockRequest({
        body: {
          aha_fields_to_load: ['field1', 'field2'],
        },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PRODUCT_OPS'] },
          error: null,
        }),
      });

      const response = await PATCH(req);

      expect(response.status).toBe(200);
      const { updateSettings } = require('../../../../lib/settings-db');
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          aha_fields_to_load: ['field1', 'field2'],
        })
      );
    });
  });

  describe('Permission checks', () => {
    it('should check settings.update capability', async () => {
      const { canRolesPerform } = require('../../../../lib/permissions');
      const req = createMockRequest({
        body: { threshold_tier1: 0.95 },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PRODUCT_OPS'] },
          error: null,
        }),
      });

      await PATCH(req);

      expect(canRolesPerform).toHaveBeenCalledWith(['PRODUCT_OPS'], 'settings.update');
    });

    it('should return 403 when user lacks settings.update permission', async () => {
      const { canRolesPerform } = require('../../../../lib/permissions');
      canRolesPerform.mockResolvedValueOnce(false);

      const req = createMockRequest({
        body: { threshold_tier1: 0.95 },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['OTHER'] },
          error: null,
        }),
      });

      const response = await PATCH(req);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('Aha fields deduplication', () => {
    it('should handle duplicate aha_fields_to_load', async () => {
      const { debugLog } = require('../../../../lib/debug');
      const req = createMockRequest({
        body: {
          aha_fields_to_load: ['field1', 'field2', 'field1'], // Duplicate
        },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PRODUCT_OPS'] },
          error: null,
        }),
      });

      await PATCH(req);

      // Should log that duplicates were detected
      expect(debugLog).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hasDuplicatesInRequest: true,
          }),
        })
      );
    });
  });

  describe('Error handling for invalid data', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getAuthenticatedUserEmail } = require('../../../../lib/api-auth');
      getAuthenticatedUserEmail.mockResolvedValueOnce(null);

      const req = createMockRequest({
        body: { threshold_tier1: 0.95 },
      });

      const response = await PATCH(req);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('should return 404 when user profile not found', async () => {
      const req = createMockRequest({
        body: { threshold_tier1: 0.95 },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      });

      const response = await PATCH(req);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe('User profile not found');
    });

    it('should return 500 when updateSettings fails', async () => {
      const { updateSettings } = require('../../../../lib/settings-db');
      updateSettings.mockRejectedValueOnce(new Error('Database error'));

      const req = createMockRequest({
        body: { threshold_tier1: 0.95 },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PRODUCT_OPS'] },
          error: null,
        }),
      });

      const response = await PATCH(req);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('Failed to update settings');
      expect(body.details).toBe('Database error');
    });

    it('should handle database errors with error codes', async () => {
      const { updateSettings } = require('../../../../lib/settings-db');
      updateSettings.mockRejectedValueOnce({
        message: 'Constraint violation',
        code: '23505',
        details: 'Duplicate key',
        hint: 'Try updating existing record',
      });

      const req = createMockRequest({
        body: { threshold_tier1: 0.95 },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PRODUCT_OPS'] },
          error: null,
        }),
      });

      const response = await PATCH(req);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('Failed to update settings');
      expect(body.code).toBe('23505');
    });
  });

  describe('User not found handling', () => {
    it('should handle PGRST116 error code specifically', async () => {
      const req = createMockRequest({
        body: { threshold_tier1: 0.95 },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      });

      const response = await PATCH(req);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe('User profile not found');
    });

    it('should throw other user errors', async () => {
      const req = createMockRequest({
        body: { threshold_tier1: 0.95 },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'Database error' },
        }),
      });

      // Should throw the error (not catch and return 404)
      await expect(PATCH(req)).rejects.toThrow();
    });
  });
});
