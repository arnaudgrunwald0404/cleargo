/**
 * Tests for epic sync auto-fetch release functionality
 */

import { POST } from '../sync/route';
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
    auth: {
        getUser: jest.fn(),
    },
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
    upsert: jest.fn().mockReturnThis(),
};

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(() => mockSupabase),
}));

// Mock roles
jest.mock('@/lib/roles', () => ({
    resolveRole: jest.fn().mockResolvedValue('PRODUCT_OPS'),
}));

// Mock Aha client
const mockGetEpics = jest.fn();
const mockGetEpic = jest.fn();
const mockGetReleases = jest.fn();
const mockGetReleaseEpics = jest.fn();

jest.mock('@/lib/aha/client', () => ({
    getAhaClient: jest.fn(() => ({
        getEpics: (...args: any[]) => mockGetEpics(...args),
        getEpic: (...args: any[]) => mockGetEpic(...args),
        getReleases: (...args: any[]) => mockGetReleases(...args),
        getReleaseEpics: (...args: any[]) => mockGetReleaseEpics(...args),
    })),
    getReleases: (...args: any[]) => mockGetReleases(...args),
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

// Mock mapping
jest.mock('@/lib/aha/mapping', () => ({
    shouldProcessEpic: jest.fn().mockResolvedValue(true),
    mapEpicToEpic: jest.fn().mockImplementation(async (epic: any) => ({
        aha_id: epic?.reference_num || epic?.id || 'E-123',
        name: epic?.name || 'Test Epic',
        tier: 'TIER_1',
        aha_release_name: epic?.release?.name || 'Release 2025.10',
        owner_email: 'owner@example.com',
    })),
}));

// Mock settings
jest.mock('@/lib/settings-db', () => ({
    getSettings: jest.fn().mockResolvedValue({
        aha_fields_to_load: [],
    }),
}));

describe('Epic Sync Auto-Fetch Release', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Default auth mock
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { email: 'test@example.com' } },
            error: null,
        });
        
        // Default release schedule mock (empty - no releases synced)
        mockSupabase.from.mockImplementation((table: string) => {
            if (table === 'release_schedule') {
                return {
                    select: jest.fn().mockResolvedValue({
                        data: [], // No releases synced
                        error: null,
                    }),
                };
            }
            return mockSupabase;
        });
        
        // Default epic mocks
        mockGetEpics.mockResolvedValue({
            epics: [
                {
                    id: 'E-123',
                    reference_num: 'E-123',
                    name: 'Test Epic',
                    tags: ['LaunchConsole'],
                },
            ],
        });
        
        mockGetEpic.mockResolvedValue({
            id: 'E-123',
            reference_num: 'E-123',
            name: 'Test Epic',
            tags: ['LaunchConsole'],
            release: { name: 'Release 2025.10' },
        });
        
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
        mockFetchAndUpsertReleaseFromAha.mockResolvedValue('2025-10-10');
        
        const mockReq = {
            url: 'http://localhost/api/integrations/aha/sync?sync_all=true',
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(res.status).toBe(200);
        expect(mockFetchAndUpsertReleaseFromAha).toHaveBeenCalledWith('Release 2025.10');
        expect(body.results.processed).toBe(1);
        expect(body.results.created).toBe(1);
    });

    it('should continue processing epic even if release has no date', async () => {
        mockFetchAndUpsertReleaseFromAha.mockResolvedValue(null); // Release found but no date
        
        const mockReq = {
            url: 'http://localhost/api/integrations/aha/sync?sync_all=true',
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(res.status).toBe(200);
        expect(body.results.processed).toBe(1);
        expect(body.results.created).toBe(1);
    });

    it('should log warning and continue if release fetch fails', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        
        mockFetchAndUpsertReleaseFromAha.mockRejectedValue(new Error('Aha API error'));
        
        const mockReq = {
            url: 'http://localhost/api/integrations/aha/sync?sync_all=true',
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(res.status).toBe(200);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to auto-fetch release'),
            expect.any(Error)
        );
        expect(body.results.errors.length).toBeGreaterThan(0);
        // Epic should still be processed
        expect(body.results.processed).toBe(1);
        
        consoleErrorSpy.mockRestore();
    });

    it('should not fetch release if it already exists in system', async () => {
        // Mock that release already exists
        mockSupabase.from.mockImplementation((table: string) => {
            if (table === 'release_schedule') {
                return {
                    select: jest.fn().mockResolvedValue({
                        data: [{ release_name: 'Release 2025.10' }], // Release already synced
                        error: null,
                    }),
                };
            }
            return mockSupabase;
        });
        
        const mockReq = {
            url: 'http://localhost/api/integrations/aha/sync?sync_all=true',
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(res.status).toBe(200);
        expect(mockFetchAndUpsertReleaseFromAha).not.toHaveBeenCalled();
        expect(body.results.processed).toBe(1);
    });

    it('should add fetched release to syncedReleaseNames set', async () => {
        mockFetchAndUpsertReleaseFromAha.mockResolvedValue('2025-10-10');
        
        // Mock multiple epics with same release
        mockGetEpics.mockResolvedValue({
            epics: [
                {
                    id: 'E-123',
                    reference_num: 'E-123',
                    name: 'Epic 1',
                    tags: ['LaunchConsole'],
                },
                {
                    id: 'E-124',
                    reference_num: 'E-124',
                    name: 'Epic 2',
                    tags: ['LaunchConsole'],
                },
            ],
        });
        
        mockGetEpic
            .mockResolvedValueOnce({
                id: 'E-123',
                reference_num: 'E-123',
                name: 'Epic 1',
                tags: ['LaunchConsole'],
                release: { name: 'Release 2025.10' },
            })
            .mockResolvedValueOnce({
                id: 'E-124',
                reference_num: 'E-124',
                name: 'Epic 2',
                tags: ['LaunchConsole'],
                release: { name: 'Release 2025.10' },
            });
        
        mockGetEpicByAhaId.mockResolvedValue(null);
        mockUpsertEpicFromAha
            .mockResolvedValueOnce({ id: 'epic-123', aha_id: 'E-123', name: 'Epic 1', tier: 'TIER_1' })
            .mockResolvedValueOnce({ id: 'epic-124', aha_id: 'E-124', name: 'Epic 2', tier: 'TIER_1' });
        
        const mockReq = {
            url: 'http://localhost/api/integrations/aha/sync?sync_all=true',
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(res.status).toBe(200);
        // Should only fetch once, even though two epics have the same release
        expect(mockFetchAndUpsertReleaseFromAha).toHaveBeenCalledTimes(1);
        expect(body.results.processed).toBe(2);
    });

    it('should use release epics endpoint when release param provided and revalidate removals', async () => {
        // Aha release lookup
        mockGetReleases.mockResolvedValueOnce({
            releases: [{ id: 'r1', name: 'Release 2025.10', start_date: '2025-10-01', end_date: '2025-10-10' }],
        });

        // Epics in release: E-123
        mockGetReleaseEpics.mockResolvedValueOnce({
            epics: [{ id: 'E-123', reference_num: 'E-123', name: 'Epic In Release', tags: ['LaunchConsole'] }],
        });

        // Full epic fetch
        mockGetEpic.mockImplementation(async (id: string) => ({
            id,
            reference_num: id,
            name: `Epic ${id}`,
            tags: ['LaunchConsole'],
            release: { name: id === 'E-999' ? 'Other Release' : 'Release 2025.10' },
        }));

        // E-999 exists (will be revalidated as removed), E-123 is new
        mockGetEpicByAhaId.mockImplementation(async (ahaId: string) => {
            if (ahaId === 'E-123') return null;
            return { id: 'existing-epic', aha_id: ahaId, name: `Existing ${ahaId}`, tier: 'TIER_1' };
        });

        mockUpsertEpicFromAha.mockImplementation(async (epicData: any) => ({
            id: `db-${epicData.aha_id}`,
            aha_id: epicData.aha_id,
            name: epicData.name,
            tier: epicData.tier,
        }));

        const req = {
            url: 'http://localhost/api/integrations/aha/sync?release=Release%202025.10',
            json: jest.fn().mockResolvedValue({ existingAhaIds: ['E-999'] }),
        } as unknown as NextRequest;

        const res = await POST(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(mockGetEpics).not.toHaveBeenCalled();
        expect(mockGetReleaseEpics).toHaveBeenCalled();
        expect(mockGetEpic).toHaveBeenCalledWith('E-999');
        expect(mockGetEpic).toHaveBeenCalledWith('E-123');
        expect(body.results.removed_from_release).toBe(1);
        expect(body.results.created).toBe(1);
        expect(body.results.updated).toBe(1);
    });
});

