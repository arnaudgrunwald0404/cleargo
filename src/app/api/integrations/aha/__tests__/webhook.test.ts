/**
 * Integration tests for Aha! Webhook
 * Tests payload verification and processing
 */

import { POST } from '../webhook/route';

import { NextRequest, NextResponse } from 'next/server';

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
const mockFetchAndUpsertReleaseFromAha = jest.fn();
jest.mock('@/lib/db/epics', () => ({
    upsertEpicFromAha: jest.fn().mockResolvedValue({ id: 'epic-123', aha_id: 'E-123', tier: 'TIER_1' }),
    getUserByEmail: jest.fn().mockResolvedValue({ id: 'user-123' }),
    getFallbackProductOpsUser: jest.fn().mockResolvedValue('fallback-user-id'),
    instantiateCriteriaForEpic: jest.fn().mockResolvedValue(undefined),
    getEpicByAhaId: jest.fn().mockResolvedValue(null), // Simulate new epic
    fetchAndUpsertReleaseFromAha: (...args: any[]) => mockFetchAndUpsertReleaseFromAha(...args),
}));

// Mock webhook validator
jest.mock('@/lib/aha/webhook-validator', () => ({
    verifyWebhookSignature: jest.fn().mockResolvedValue(true),
}));

// Mock Aha client
jest.mock('@/lib/aha/client', () => ({
    getEpic: jest.fn().mockResolvedValue({
        id: 'E-123',
        reference_num: 'E-123',
        name: 'Test Epic',
        tags: ['LaunchConsole'],
        release: { name: 'Release 2025.10' },
    }),
}));

// Mock mapping
jest.mock('@/lib/aha/mapping', () => ({
    shouldProcessEpic: jest.fn().mockResolvedValue(true),
    mapEpicToEpic: jest.fn().mockResolvedValue({
        aha_id: 'E-123',
        name: 'Test Epic',
        tier: 'TIER_1',
        status: 'Pre_Release',
        aha_release_name: 'Release 2025.10',
        owner_email: 'owner@example.com',
    }),
}));

// Mock Supabase
const mockSupabase = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
};

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(() => mockSupabase),
}));

// Mock settings
jest.mock('@/lib/settings-db', () => ({
    getSettings: jest.fn().mockResolvedValue({
        aha_fields_to_load: [],
    }),
}));

describe('Aha! Webhook Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Default Supabase mock
        mockSupabase.from.mockReturnValue({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                        data: null, // Release doesn't exist
                        error: null,
                    }),
                }),
            }),
        });
        
        mockFetchAndUpsertReleaseFromAha.mockResolvedValue('2025-10-10');
    });

    it('should process valid epic event', async () => {
        // Create a mock request object that mimics NextRequest
        const mockReq = {
            text: jest.fn().mockResolvedValue(JSON.stringify({ epic: { id: 'E-123', name: 'Test Epic' } })),
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
        expect(body.message).toBe('Epic created');
        expect(body.epic_id).toBe('epic-123');
    });

    it('should reject invalid signature', async () => {
        // Override mock for this test
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
