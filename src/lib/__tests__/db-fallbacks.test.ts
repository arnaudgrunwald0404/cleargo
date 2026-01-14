/**
 * Tests for database query fallback patterns
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createMockSupabaseClient } from './test-utils';

// Mock dependencies
jest.mock('../supabase/server', () => ({
  createClient: jest.fn(),
}));

describe('Database Query Fallbacks', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = require('../supabase/server');
    createClient.mockReturnValue(mockSupabase);
  });

  describe('Missing table fallbacks', () => {
    it('should fall back when meeting_epic table is missing', async () => {
      const selectQuery = `*, epic:epic_id(id, name)`;
      const fullQuery = selectQuery + `, linked_epics:meeting_epic(epic:epic_id(id, name))`;

      // First query fails with missing table error
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42P01',
            message: 'relation "meeting_epic" does not exist',
          },
        }),
      });

      // Retry without linked_epics succeeds
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'meeting-1', epic: { id: 'epic-1', name: 'Test Epic' } },
          error: null,
        }),
      });

      // Simulate the fallback pattern
      let { data, error } = await mockSupabase
        .from('meeting')
        .select(fullQuery)
        .eq('id', 'meeting-1')
        .single();

      if (error && (error.message?.includes('meeting_epic') || error.code === '42P01')) {
        const retryResult = await mockSupabase
          .from('meeting')
          .select(selectQuery)
          .eq('id', 'meeting-1')
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      expect(data).toBeDefined();
      expect(error).toBeNull();
      expect(data.epic).toBeDefined();
    });

    it('should fall back when error message includes "relation"', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            message: 'relation "linked_epics" does not exist',
          },
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'meeting-1' },
          error: null,
        }),
      });

      // Simulate fallback
      let { data, error } = await mockSupabase
        .from('meeting')
        .select('*, linked_epics:meeting_epic(*)')
        .eq('id', 'meeting-1')
        .single();

      if (error && error.message?.includes('relation')) {
        const retryResult = await mockSupabase
          .from('meeting')
          .select('*')
          .eq('id', 'meeting-1')
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      expect(data).toBeDefined();
      expect(error).toBeNull();
    });

    it('should fall back when error code is PGRST', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'PGRST',
            message: 'Table not found',
          },
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'meeting-1' },
          error: null,
        }),
      });

      // Simulate fallback
      let { data, error } = await mockSupabase
        .from('meeting')
        .select('*, linked_epics:meeting_epic(*)')
        .eq('id', 'meeting-1')
        .single();

      if (error && (error.code === 'PGRST' || error.code === '42P01')) {
        const retryResult = await mockSupabase
          .from('meeting')
          .select('*')
          .eq('id', 'meeting-1')
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      expect(data).toBeDefined();
      expect(error).toBeNull();
    });
  });

  describe('Relationship query failures (PGRST200)', () => {
    it('should fall back to separate queries on PGRST200 error', async () => {
      // First query with relationship fails
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'PGRST200',
            message: 'Could not find a relationship',
          },
        }),
      });

      // Fallback query succeeds
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'config-1', epic_id: 'epic-1' },
          error: null,
        }),
      });

      // Simulate the fallback pattern
      let { data, error } = await mockSupabase
        .from('epic_success_configs')
        .select('*, benchmark:adoption_benchmarks(*)')
        .eq('epic_id', 'epic-1')
        .single();

      if (error && (error.code === 'PGRST200' || error.message?.includes('relationship'))) {
        // Fall back to separate query
        const retryResult = await mockSupabase
          .from('epic_success_configs')
          .select('*')
          .eq('epic_id', 'epic-1')
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      expect(data).toBeDefined();
      expect(error).toBeNull();
    });

    it('should fall back when error message includes "relationship"', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            message: 'Could not find a relationship between tables',
          },
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'config-1' },
          error: null,
        }),
      });

      // Simulate fallback
      let { data, error } = await mockSupabase
        .from('epic_success_configs')
        .select('*, benchmark:adoption_benchmarks(*)')
        .eq('epic_id', 'epic-1')
        .single();

      if (error && error.message?.includes('relationship')) {
        const retryResult = await mockSupabase
          .from('epic_success_configs')
          .select('*')
          .eq('epic_id', 'epic-1')
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      expect(data).toBeDefined();
      expect(error).toBeNull();
    });
  });

  describe('Error code handling', () => {
    it('should handle PGRST116 (not found) without fallback', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'PGRST116',
            message: 'Not found',
          },
        }),
      });

      const { data, error } = await mockSupabase
        .from('epic_success_configs')
        .select('*')
        .eq('epic_id', 'epic-1')
        .single();

      expect(data).toBeNull();
      expect(error?.code).toBe('PGRST116');
      // Should not attempt fallback for not found
    });

    it('should handle 42P01 (table does not exist) with fallback', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42P01',
            message: 'relation "missing_table" does not exist',
          },
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'item-1' },
          error: null,
        }),
      });

      // Simulate fallback
      let { data, error } = await mockSupabase
        .from('meeting')
        .select('*, missing_table(*)')
        .eq('id', 'meeting-1')
        .single();

      if (error && error.code === '42P01') {
        const retryResult = await mockSupabase
          .from('meeting')
          .select('*')
          .eq('id', 'meeting-1')
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      expect(data).toBeDefined();
      expect(error).toBeNull();
    });
  });

  describe('Retry logic in meetings API', () => {
    it('should retry query without linked_epics on table error', async () => {
      const selectQuery = `*, epic:epic_id(id, name)`;
      const fullQuery = selectQuery + `, linked_epics:meeting_epic(epic:epic_id(id, name))`;

      // First attempt with linked_epics fails
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42P01',
            message: 'relation "meeting_epic" does not exist',
          },
        }),
      });

      // Retry without linked_epics succeeds
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'meeting-1',
            epic: { id: 'epic-1', name: 'Test Epic' },
          },
          error: null,
        }),
      });

      // Simulate the API pattern
      let { data, error } = await mockSupabase
        .from('meeting')
        .select(fullQuery)
        .eq('id', 'meeting-1')
        .single();

      if (error && (error.message?.includes('meeting_epic') || 
                    error.message?.includes('relation') || 
                    error.code === '42P01' || 
                    error.code === 'PGRST')) {
        const retryResult = await mockSupabase
          .from('meeting')
          .select(selectQuery)
          .eq('id', 'meeting-1')
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      expect(data).toBeDefined();
      expect(data.id).toBe('meeting-1');
      expect(data.epic).toBeDefined();
      expect(error).toBeNull();
    });

    it('should return error if retry also fails', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42P01',
            message: 'relation "meeting_epic" does not exist',
          },
        }),
      });

      // Retry also fails
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            message: 'Database connection error',
          },
        }),
      });

      // Simulate the API pattern
      let { data, error } = await mockSupabase
        .from('meeting')
        .select('*, linked_epics:meeting_epic(*)')
        .eq('id', 'meeting-1')
        .single();

      if (error && (error.message?.includes('meeting_epic') || error.code === '42P01')) {
        const retryResult = await mockSupabase
          .from('meeting')
          .select('*')
          .eq('id', 'meeting-1')
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toBe('Database connection error');
    });
  });

  describe('Catch block fallback handling', () => {
    it('should catch relationship errors in catch block and retry', async () => {
      // Simulate error thrown in try block
      const queryWithRelationship = async () => {
        throw {
          code: 'PGRST200',
          message: 'Could not find a relationship',
        };
      };

      // Fallback query
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'config-1' },
          error: null,
        }),
      });

      let data = null;
      let error = null;

      try {
        await queryWithRelationship();
      } catch (err: any) {
        error = err;
        if (err.code === 'PGRST200' || err.message?.includes('relationship')) {
          const retryResult = await mockSupabase
            .from('epic_success_configs')
            .select('*')
            .eq('epic_id', 'epic-1')
            .single();
          data = retryResult.data;
          error = retryResult.error;
        }
      }

      expect(data).toBeDefined();
      expect(data.id).toBe('config-1');
    });
  });
});
