/**
 * Tests for criteria status update API route
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { PATCH } from '../route';
import { createMockSupabaseClient, createMockRequest } from '../../../../../../lib/__tests__/test-utils';

// Mock dependencies
jest.mock('../../../../../../lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('../../../../../../lib/api-auth', () => ({
  getAuthenticatedUserEmail: jest.fn().mockResolvedValue('user@example.com'),
}));

jest.mock('../../../../../../lib/readiness', () => ({
  recomputeEpicReadiness: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../../../../lib/permissions', () => ({
  canRolesPerform: jest.fn().mockResolvedValue(true),
}));

describe('PATCH /api/epics/[id]/criteria/[lcsId]', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = require('../../../../../../lib/supabase/server');
    createClient.mockReturnValue(mockSupabase);
  });

  describe('Status update validation', () => {
    it('should update status successfully', async () => {
      const req = createMockRequest({
        body: {
          status: 'GO',
          notes: 'All checks passed',
        },
      });

      // Mock app_user lookup
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123' },
          error: null,
        }),
      });

      // Mock roles lookup
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PM'] },
          error: null,
        }),
      });

      // Mock status update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'lcs-123',
            status: 'GO',
            current_status_notes: 'All checks passed',
            last_updated_at: new Date().toISOString(),
            last_updated_by: 'user-123',
          },
          error: null,
        }),
      });

      const response = await PATCH(req, {
        params: Promise.resolve({ id: 'epic-123', lcsId: 'lcs-123' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe('GO');
    });

    it('should update condition and due date', async () => {
      const req = createMockRequest({
        body: {
          status: 'CONDITIONAL',
          condition: 'Need approval from legal',
          condition_due_date: '2024-12-31',
        },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123' },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PM'] },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'lcs-123',
            status: 'CONDITIONAL',
            condition: 'Need approval from legal',
            condition_due_date: '2024-12-31',
          },
          error: null,
        }),
      });

      const response = await PATCH(req, {
        params: Promise.resolve({ id: 'epic-123', lcsId: 'lcs-123' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.condition).toBe('Need approval from legal');
    });
  });

  describe('Readiness recalculation trigger', () => {
    it('should trigger readiness recalculation after status update', async () => {
      const { recomputeEpicReadiness } = require('../../../../../../lib/readiness');
      const req = createMockRequest({
        body: { status: 'GO' },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123' },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PM'] },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'lcs-123', status: 'GO' },
          error: null,
        }),
      });

      await PATCH(req, {
        params: Promise.resolve({ id: 'epic-123', lcsId: 'lcs-123' }),
      });

      expect(recomputeEpicReadiness).toHaveBeenCalledWith('epic-123');
    });
  });

  describe('Data source value handling', () => {
    it('should update data_source_values', async () => {
      const req = createMockRequest({
        body: {
          status: 'GO',
          data_source_values: {
            'url-1': 'https://example.com/doc',
          },
        },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123' },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PM'] },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'lcs-123',
            status: 'GO',
            data_source_values: {
              'url-1': 'https://example.com/doc',
            },
          },
          error: null,
        }),
      });

      const response = await PATCH(req, {
        params: Promise.resolve({ id: 'epic-123', lcsId: 'lcs-123' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data_source_values).toBeDefined();
    });
  });

  describe('Error responses for invalid data', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getAuthenticatedUserEmail } = require('../../../../../../lib/api-auth');
      getAuthenticatedUserEmail.mockResolvedValueOnce(null);

      const req = createMockRequest({
        body: { status: 'GO' },
      });

      const response = await PATCH(req, {
        params: Promise.resolve({ id: 'epic-123', lcsId: 'lcs-123' }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('should return 404 when user profile not found', async () => {
      const req = createMockRequest({
        body: { status: 'GO' },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      });

      const response = await PATCH(req, {
        params: Promise.resolve({ id: 'epic-123', lcsId: 'lcs-123' }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe('User profile not found');
    });

    it('should return 403 when user lacks permission', async () => {
      const { canRolesPerform } = require('../../../../../../lib/permissions');
      canRolesPerform.mockResolvedValueOnce(false);

      const req = createMockRequest({
        body: { status: 'GO' },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123' },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['OTHER'] },
          error: null,
        }),
      });

      const response = await PATCH(req, {
        params: Promise.resolve({ id: 'epic-123', lcsId: 'lcs-123' }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain('Forbidden');
    });

    it('should return 500 when database update fails', async () => {
      const req = createMockRequest({
        body: { status: 'GO' },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123' },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PM'] },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            message: 'Database error',
            code: '23505',
            details: 'Duplicate key',
          },
        }),
      });

      const response = await PATCH(req, {
        params: Promise.resolve({ id: 'epic-123', lcsId: 'lcs-123' }),
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('Database error');
      expect(body.details).toBe('Duplicate key');
    });
  });

  describe('User permission checks', () => {
    it('should check criteria.status.update permission', async () => {
      const { canRolesPerform } = require('../../../../../../lib/permissions');
      const req = createMockRequest({
        body: { status: 'GO' },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123' },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PM'] },
          error: null,
        }),
      });

      await PATCH(req, {
        params: Promise.resolve({ id: 'epic-123', lcsId: 'lcs-123' }),
      });

      expect(canRolesPerform).toHaveBeenCalledWith(['PM'], 'criteria.status.update');
    });
  });

  describe('Security checks', () => {
    it('should verify epic_id matches in update query', async () => {
      const req = createMockRequest({
        body: { status: 'GO' },
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'user-123' },
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { roles: ['PM'] },
          error: null,
        }),
      });

      const updateMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'lcs-123', status: 'GO' },
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValueOnce(updateMock);

      await PATCH(req, {
        params: Promise.resolve({ id: 'epic-123', lcsId: 'lcs-123' }),
      });

      // Should call eq('epic_id', 'epic-123') for security
      expect(updateMock.eq).toHaveBeenCalledWith('epic_id', 'epic-123');
    });
  });
});
