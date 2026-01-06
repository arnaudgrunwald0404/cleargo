/**
 * Integration tests for Aha! Webhook
 * Tests payload verification and processing
 */

import { POST } from '../webhook/route';

import { NextRequest } from 'next/server';

// Mock NextResponse
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  const mockNextResponse = jest.fn().mockImplementation((body, init) => ({
    json: async () => JSON.parse(body), // Mock json() method on instance if needed
    status: init?.status || 200,
  }));

  // Add static json method to the mock
  (mockNextResponse as any).json = jest.fn((body, init) => ({
    json: async () => body,
    status: init?.status || 200,
  }));

  return {
    ...actual,
    NextResponse: mockNextResponse,
  };
});

// Mock DB functions
jest.mock('@/lib/db/launches', () => ({
  upsertLaunchFromAha: jest
    .fn()
    .mockResolvedValue({ id: 'launch-123', aha_id: 'E-123', tier: 'TIER_1' }),
  getUserByEmail: jest.fn().mockResolvedValue({ id: 'user-123' }),
  getFallbackProductOpsUser: jest.fn().mockResolvedValue('fallback-user-id'),
  instantiateCriteriaForLaunch: jest.fn().mockResolvedValue(undefined),
  getLaunchByAhaId: jest.fn().mockResolvedValue(null), // Simulate new launch
}));

// Mock webhook validator
jest.mock('@/lib/aha/webhook-validator', () => ({
  verifyWebhookSignature: jest.fn().mockResolvedValue(true),
}));

// Mock mapping
jest.mock('@/lib/aha/mapping', () => ({
  shouldProcessEpic: jest.fn().mockResolvedValue(true),
  mapEpicToLaunch: jest.fn().mockResolvedValue({
    aha_id: 'E-123',
    name: 'Test Epic',
    tier: 'TIER_1',
    status: 'PLANNED',
    owner_email: 'owner@example.com',
  }),
}));

describe('Aha! Webhook Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process valid epic event', async () => {
    // Create a mock request object that mimics NextRequest
    const mockReq = {
      text: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ epic: { id: 'E-123', name: 'Test Epic' } })),
      headers: {
        get: jest.fn().mockReturnValue('valid-signature'),
      },
      nextUrl: {
        searchParams: new URLSearchParams(),
      },
    } as unknown as NextRequest;

    const res = await POST(mockReq);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.message).toBe('Launch created');
    expect(body.launch_id).toBe('launch-123');
  });

  it('should reject invalid signature', async () => {
    // Override mock for this test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { verifyWebhookSignature } = require('@/lib/aha/webhook-validator');
    verifyWebhookSignature.mockResolvedValueOnce(false);

    const mockReq = {
      text: jest.fn().mockResolvedValue(JSON.stringify({ epic: {} })),
      headers: {
        get: jest.fn().mockReturnValue('invalid-signature'),
      },
    } as unknown as NextRequest;

    const res = await POST(mockReq);
    expect(res.status).toBe(401);
  });
});
