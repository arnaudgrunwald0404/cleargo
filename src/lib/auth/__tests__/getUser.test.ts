/**
 * Tests for getUser authentication function
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { getUser } from '../getUser';
import { createMockSupabaseClient, createMockAuthUser } from '../../__tests__/test-utils';

// Mock dependencies
jest.mock('../../supabase/server', () => ({
  createClient: jest.fn(),
}));

describe('getUser', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = require('../../supabase/server');
    createClient.mockReturnValue(mockSupabase);
  });

  describe('Missing email/unauthorized requests', () => {
    it('should throw error when no authenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      await expect(getUser()).rejects.toThrow('Unauthorized');
    });

    it('should throw error when user has no email', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: null } },
        error: null,
      });

      await expect(getUser()).rejects.toThrow('Unauthorized');
    });
  });

  describe('User not found in app_user table', () => {
    it('should return empty roles when user not found', async () => {
      const authUser = createMockAuthUser({ email: 'user@example.com' });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      });

      const result = await getUser();

      expect(result.id).toBe(authUser.id);
      expect(result.roles).toEqual([]);
    });
  });

  describe('Role mapping', () => {
    it('should map PRODUCT_OPS to ADMIN', async () => {
      const authUser = createMockAuthUser({ email: 'user@example.com' });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: ['PRODUCT_OPS'],
            role: null,
          },
          error: null,
        }),
      });

      const result = await getUser();

      expect(result.roles).toContain('ADMIN');
    });

    it('should map CPO to ADMIN and EXEC', async () => {
      const authUser = createMockAuthUser({ email: 'user@example.com' });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: ['CPO'],
            role: null,
          },
          error: null,
        }),
      });

      const result = await getUser();

      expect(result.roles).toContain('ADMIN');
      expect(result.roles).toContain('EXEC');
    });

    it('should map SUPERADMIN to ADMIN', async () => {
      const authUser = createMockAuthUser({ email: 'user@example.com' });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: ['SUPERADMIN'],
            role: null,
          },
          error: null,
        }),
      });

      const result = await getUser();

      expect(result.roles).toContain('ADMIN');
    });

    it('should map PM to PM', async () => {
      const authUser = createMockAuthUser({ email: 'user@example.com' });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: ['PM'],
            role: null,
          },
          error: null,
        }),
      });

      const result = await getUser();

      expect(result.roles).toContain('PM');
    });

    it('should map PMM to PMM', async () => {
      const authUser = createMockAuthUser({ email: 'user@example.com' });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: ['PMM'],
            role: null,
          },
          error: null,
        }),
      });

      const result = await getUser();

      expect(result.roles).toContain('PMM');
    });

    it('should map SUPPORT_LEAD to CS', async () => {
      const authUser = createMockAuthUser({ email: 'user@example.com' });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: ['SUPPORT_LEAD'],
            role: null,
          },
          error: null,
        }),
      });

      const result = await getUser();

      expect(result.roles).toContain('CS');
    });
  });

  describe('Legacy role field handling', () => {
    it('should use legacy role field when roles array is empty', async () => {
      const authUser = createMockAuthUser({ email: 'user@example.com' });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: [],
            role: 'PM',
          },
          error: null,
        }),
      });

      const result = await getUser();

      expect(result.roles).toContain('PM');
    });

    it('should use legacy role field when roles array is null', async () => {
      const authUser = createMockAuthUser({ email: 'user@example.com' });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: null,
            role: 'PMM',
          },
          error: null,
        }),
      });

      const result = await getUser();

      expect(result.roles).toContain('PMM');
    });
  });

  describe('Case insensitivity', () => {
    it('should handle lowercase role names', async () => {
      const authUser = createMockAuthUser({ email: 'user@example.com' });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: ['pm'],
            role: null,
          },
          error: null,
        }),
      });

      const result = await getUser();

      expect(result.roles).toContain('PM');
    });
  });
});
