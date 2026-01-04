/**
 * Tests for webhook auto-fetch release functionality
 */

import { POST } from '../webhook/route';
import { NextRequest, NextResponse } from 'next/server';

// Mock NextResponse
jest.mock('next/server', () => {
    const actual = jest.requireActual('next/server');
    const mockNextResponse = jest.fn().mockImplementation((body, init) => ({
        json: async () => body,
        status: init?.status || 200,
    }));

    // Add static json method to the mock
    (mockNextResponse as any).json = jest.fn((body, init) => ({
        json: async () => body,
        status: init?.status || 200,
    }));

    return {
        ...actual,
        NextRequest: actual.NextRequest,
        NextResponse: mockNextResponse,
    };
});

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

// Mock Aha client
const mockGetEpic = jest.fn();

jest.mock('@/lib/aha/client', () => ({
    getEpic: (...args: any[]) => mockGetEpic(...args),
}));

// Mock DB functions
const mockUpsertEpicFromAha = jest.fn();
const mockGetEpicByAhaId = jest.fn();
const mockInstantiateCriteriaForEpic = jest.fn();
const mockGetUserByEmail = jest.fn();
const mockGetFallbackProductOpsUser = jest.fn();
const mockFetchAndUpsertReleaseFromAha = jest.fn();

jest.mock('@/lib/db/epics', () => ({
    upsertEpicFromAha: (...args: any[]) => mockUpsertEpicFromAha(...args),
    getEpicByAhaId: (...args: any[]) => mockGetEpicByAhaId(...args),
    instantiateCriteriaForEpic: (...args: any[]) => mockInstantiateCriteriaForEpic(...args),
    getUserByEmail: (...args: any[]) => mockGetUserByEmail(...args),
    getFallbackProductOpsUser: (...args: any[]) => mockGetFallbackProductOpsUser(...args),
    fetchAndUpsertReleaseFromAha: (...args: any[]) => mockFetchAndUpsertReleaseFromAha(...args),
}));

// Mock webhook validator
jest.mock('@/lib/aha/webhook-validator', () => ({
    verifyWebhookSignature: jest.fn().mockResolvedValue(true),
}));

// Mock mapping
jest.mock('@/lib/aha/mapping', () => ({
    shouldProcessEpic: jest.fn().mockResolvedValue(true),
    mapEpicToEpic: jest.fn().mockResolvedValue({
        aha_id: 'E-123',
        name: 'Test Epic',
        tier: 'TIER_1',
        aha_release_name: 'Release 2025.10',
        owner_email: 'owner@example.com',
    }),
}));

// Mock settings
jest.mock('@/lib/settings-db', () => ({
    getSettings: jest.fn().mockResolvedValue({
        aha_fields_to_load: [],
    }),
}));

describe('Webhook Auto-Fetch Release', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Default epic mock
        mockGetEpic.mockResolvedValue({
            id: 'E-123',
            reference_num: 'E-123',
            name: 'Test Epic',
            tags: ['LaunchConsole'],
            release: { name: 'Release 2025.10' },
        });
        
        // Default DB mocks
        mockGetEpicByAhaId.mockResolvedValue(null); // New epic
        mockUpsertEpicFromAha.mockResolvedValue({
            id: 'epic-123',
            aha_id: 'E-123',
            name: 'Test Epic',
            tier: 'TIER_1',
        });
        mockGetUserByEmail.mockResolvedValue({ id: 'user-123' });
        mockGetFallbackProductOpsUser.mockResolvedValue('fallback-user-id');
    });

    it('should auto-fetch release when epic belongs to unsynced release', async () => {
        // Mock that release doesn't exist
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
        
        const mockReq = {
            text: jest.fn().mockResolvedValue(JSON.stringify({
                epic: { id: 'E-123', name: 'Test Epic' },
            })),
            headers: {
                get: jest.fn().mockReturnValue('valid-signature'),
            },
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(res.status).toBe(200);
        expect(mockFetchAndUpsertReleaseFromAha).toHaveBeenCalledWith('Release 2025.10');
        expect(body.message).toBe('Epic created');
    });

    it('should not fetch release if it already exists', async () => {
        // Mock that release already exists
        mockSupabase.from.mockReturnValue({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                        data: { release_name: 'Release 2025.10' }, // Release exists
                        error: null,
                    }),
                }),
            }),
        });
        
        const mockReq = {
            text: jest.fn().mockResolvedValue(JSON.stringify({
                epic: { id: 'E-123', name: 'Test Epic' },
            })),
            headers: {
                get: jest.fn().mockReturnValue('valid-signature'),
            },
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(res.status).toBe(200);
        expect(mockFetchAndUpsertReleaseFromAha).not.toHaveBeenCalled();
        expect(body.message).toBe('Epic created');
    });

    it('should continue processing epic even if release fetch fails', async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        // Mock that release doesn't exist
        mockSupabase.from.mockReturnValue({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                        data: null,
                        error: null,
                    }),
                }),
            }),
        });
        
        mockFetchAndUpsertReleaseFromAha.mockRejectedValue(new Error('Aha API error'));
        
        const mockReq = {
            text: jest.fn().mockResolvedValue(JSON.stringify({
                epic: { id: 'E-123', name: 'Test Epic' },
            })),
            headers: {
                get: jest.fn().mockReturnValue('valid-signature'),
            },
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(res.status).toBe(200);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to auto-fetch release')
        );
        expect(body.message).toBe('Epic created'); // Epic should still be created
        
        consoleWarnSpy.mockRestore();
    });

    it('should not fetch release if epic has no release assigned', async () => {
        // Mock epic with no release
        const { mapEpicToEpic } = require('@/lib/aha/mapping');
        mapEpicToEpic.mockResolvedValueOnce({
            aha_id: 'E-123',
            name: 'Test Epic',
            tier: 'TIER_1',
            aha_release_name: null, // No release
            owner_email: 'owner@example.com',
        });
        
        const mockReq = {
            text: jest.fn().mockResolvedValue(JSON.stringify({
                epic: { id: 'E-123', name: 'Test Epic' },
            })),
            headers: {
                get: jest.fn().mockReturnValue('valid-signature'),
            },
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(res.status).toBe(200);
        expect(mockFetchAndUpsertReleaseFromAha).not.toHaveBeenCalled();
        expect(body.message).toBe('Epic created');
    });
});

