/**
 * Integration tests for Aha! Write-back
 */

import { writeBackEpicReadiness } from '../write-back';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => {
  const mockSupabase = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    update: jest.fn().mockReturnThis(),
  };
  return {
    createClient: jest.fn(() => mockSupabase),
  };
});

// Mock mapping
jest.mock('@/lib/aha/mapping', () => ({
  buildWriteBackPayload: jest.fn().mockReturnValue({
    custom_field_key: 'value',
  }),
}));

describe('Aha! Write-back Integration', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Get the mock instance returned by createClient
    mockSupabase = (createClient as jest.Mock)();
  });

  it('should send update to Aha when launch exists', async () => {
    // Mock launch data
    mockSupabase.single.mockResolvedValue({
      data: {
        id: '123',
        aha_id: 'E-123',
        readiness_status: 'GO',
        readiness_score: 0.95,
        risk_level: 'LOW',
        target_launch_date: '2025-12-01',
        console_url: 'https://console.com/123',
      },
      error: null,
    });

    // Mock Aha API response
    // Mock fetch for Aha API
    // global.fetch is polyfilled by whatwg-fetch in setup
    const fetchMock = jest.spyOn(global, 'fetch');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    await writeBackEpicReadiness('123');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/epics/E-123'),
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"custom_fields"'),
      })
    );
  });

  it('should handle missing launch gracefully', async () => {
    mockSupabase.single.mockResolvedValue({
      data: null,
      error: { message: 'Not found' },
    });

    await expect(writeBackEpicReadiness('999')).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
