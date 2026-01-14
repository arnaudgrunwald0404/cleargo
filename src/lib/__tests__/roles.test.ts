/**
 * Tests for role resolution and authentication edge cases
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { resolveRole, isAdminRole } from '../roles';
import { createMockSupabaseClient } from './test-utils';

// Mock dependencies
jest.mock('../supabase/server', () => ({
  createClient: jest.fn(),
  createAdminClient: jest.fn(),
}));

describe('resolveRole', () => {
  let mockSupabase: any;
  let mockAdminClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockAdminClient = createMockSupabaseClient();
    
    const { createClient, createAdminClient } = require('../supabase/server');
    createClient.mockReturnValue(mockSupabase);
    createAdminClient.mockReturnValue(mockAdminClient);
  });

  describe('User not found in app_user table (PGRST116 error)', () => {
    it('should return OTHER when user not found', async () => {
      mockAdminClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      });

      const role = await resolveRole('unknown@example.com');

      expect(role).toBe('OTHER');
    });

    it('should return PRODUCT_OPS for fallback email when user not found', async () => {
      const fallbackEmail = process.env.FALLBACK_PRODUCT_OPS_EMAIL || 'agrunwald@clearcompany.com';
      
      mockAdminClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      });

      const role = await resolveRole(fallbackEmail);

      expect(role).toBe('PRODUCT_OPS');
    });
  });

  describe('Role resolution edge cases', () => {
    it('should return first role from roles array', async () => {
      mockAdminClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: ['PRODUCT_OPS', 'CPO'],
            role: null,
          },
          error: null,
        }),
      });

      const role = await resolveRole('user@example.com');

      expect(role).toBe('PRODUCT_OPS');
    });

    it('should fall back to legacy role field when roles array is empty', async () => {
      mockAdminClient.from.mockReturnValueOnce({
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

      const role = await resolveRole('user@example.com');

      expect(role).toBe('PM');
    });

    it('should fall back to legacy role field when roles array is null', async () => {
      mockAdminClient.from.mockReturnValueOnce({
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

      const role = await resolveRole('user@example.com');

      expect(role).toBe('PMM');
    });

    it('should return OTHER when no roles found', async () => {
      mockAdminClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: null,
            role: null,
          },
          error: null,
        }),
      });

      const role = await resolveRole('user@example.com');

      expect(role).toBe('OTHER');
    });

    it('should return PRODUCT_OPS for fallback email when no roles in database', async () => {
      const fallbackEmail = process.env.FALLBACK_PRODUCT_OPS_EMAIL || 'agrunwald@clearcompany.com';
      
      mockAdminClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            roles: null,
            role: null,
          },
          error: null,
        }),
      });

      const role = await resolveRole(fallbackEmail);

      expect(role).toBe('PRODUCT_OPS');
    });
  });

  describe('Admin client fallback', () => {
    it('should fall back to regular client if admin client fails', async () => {
      const { createAdminClient } = require('../supabase/server');
      createAdminClient.mockImplementation(() => {
        throw new Error('Admin client not available');
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

      const role = await resolveRole('user@example.com');

      expect(role).toBe('PM');
    });
  });

  describe('Error handling', () => {
    it('should return OTHER when database query fails', async () => {
      mockAdminClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      const role = await resolveRole('user@example.com');

      expect(role).toBe('OTHER');
    });

    it('should return PRODUCT_OPS for fallback email when query fails', async () => {
      const fallbackEmail = process.env.FALLBACK_PRODUCT_OPS_EMAIL || 'agrunwald@clearcompany.com';
      
      mockAdminClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      const role = await resolveRole(fallbackEmail);

      expect(role).toBe('PRODUCT_OPS');
    });
  });

  describe('Email normalization', () => {
    it('should normalize email to lowercase', async () => {
      mockAdminClient.from.mockReturnValueOnce({
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

      await resolveRole('USER@EXAMPLE.COM');

      const eqCall = mockAdminClient.from().eq;
      expect(eqCall).toHaveBeenCalledWith('email', 'user@example.com');
    });
  });
});

describe('isAdminRole', () => {
  it('should return true for SUPERADMIN', () => {
    expect(isAdminRole('SUPERADMIN')).toBe(true);
  });

  it('should return true for PRODUCT_OPS', () => {
    expect(isAdminRole('PRODUCT_OPS')).toBe(true);
  });

  it('should return true for CPO', () => {
    expect(isAdminRole('CPO')).toBe(true);
  });

  it('should return false for non-admin roles', () => {
    expect(isAdminRole('PM')).toBe(false);
    expect(isAdminRole('PMM')).toBe(false);
    expect(isAdminRole('OTHER')).toBe(false);
  });
});
