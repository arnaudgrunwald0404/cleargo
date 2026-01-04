/**
 * Tests for release sync endpoint
 * Tests syncing releases with and without dates, and reporting unknown dates
 */

import { POST } from '../sync-releases/route';
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
    upsert: jest.fn().mockReturnThis(),
};

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(() => mockSupabase),
}));

// Mock Aha client
const mockGetReleases = jest.fn();
const mockGetReleaseEpics = jest.fn();

jest.mock('@/lib/aha/client', () => ({
    getReleases: (...args: any[]) => mockGetReleases(...args),
    getReleaseEpics: (...args: any[]) => mockGetReleaseEpics(...args),
}));

// Mock permissions
jest.mock('@/lib/permissions', () => ({
    canRolesPerform: jest.fn().mockResolvedValue(true),
}));

describe('Release Sync Endpoint', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Default auth mock
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { email: 'test@example.com' } },
            error: null,
        });
        
        // Default user roles mock
        mockSupabase.from.mockReturnValue({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({
                        data: { roles: ['PRODUCT_OPS'] },
                        error: null,
                    }),
                }),
            }),
        });
        
        // Default upsert mock
        mockSupabase.upsert.mockResolvedValue({ error: null });
    });

    it('should sync all releases with epics, including those without dates', async () => {
        // Mock releases from Aha
        mockGetReleases
            .mockResolvedValueOnce({
                releases: [
                    { id: 'r1', name: 'Release 2025.10', start_date: '2025-10-01', end_date: '2025-10-10' },
                    { id: 'r2', name: 'Release 2026.1', start_date: null, end_date: null },
                    { id: 'r3', name: 'Release 2026.4', start_date: null, end_date: null },
                ],
            })
            .mockResolvedValueOnce({ releases: [] }); // Second page empty
        
        // Mock epics check - all releases have epics
        mockGetReleaseEpics.mockResolvedValue({
            epics: [{ id: 'e1' }], // At least one epic
        });
        
        const mockReq = {
            url: 'http://localhost/api/integrations/aha/sync-releases',
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.synced).toBe(3); // All 3 releases synced
        expect(body.releases_without_dates).toHaveLength(2);
        expect(body.releases_without_dates.map((r: any) => r.name)).toEqual(['Release 2026.1', 'Release 2026.4']);
        expect(body.message).toContain('without dates');
    });

    it('should report releases without dates in console logs', async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        mockGetReleases.mockResolvedValueOnce({
            releases: [
                { id: 'r1', name: 'Release Without Date', start_date: null, end_date: null },
            ],
        }).mockResolvedValueOnce({ releases: [] });
        
        mockGetReleaseEpics.mockResolvedValue({ epics: [{ id: 'e1' }] });
        
        const req = new NextRequest('http://localhost/api/integrations/aha/sync-releases', {
            method: 'POST',
        });
        
        await POST(req);
        
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Release "Release Without Date" has no date in Aha')
        );
        
        consoleWarnSpy.mockRestore();
    });

    it('should use end_date if available, otherwise start_date', async () => {
        mockGetReleases.mockResolvedValueOnce({
            releases: [
                { id: 'r1', name: 'Release With End Date', start_date: '2025-10-01', end_date: '2025-10-10' },
                { id: 'r2', name: 'Release With Start Date Only', start_date: '2025-11-01', end_date: null },
            ],
        }).mockResolvedValueOnce({ releases: [] });
        
        mockGetReleaseEpics.mockResolvedValue({ epics: [{ id: 'e1' }] });
        
        const req = new NextRequest('http://localhost/api/integrations/aha/sync-releases', {
            method: 'POST',
        });
        
        await POST(req);
        
        // Check that upsert was called with correct dates
        expect(mockSupabase.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                release_name: 'Release With End Date',
                launch_date: '2025-10-10', // Should use end_date
            }),
            expect.any(Object)
        );
        
        expect(mockSupabase.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                release_name: 'Release With Start Date Only',
                launch_date: '2025-11-01', // Should use start_date
            }),
            expect.any(Object)
        );
    });

    it('should handle pagination correctly', async () => {
        // First page: 50 releases (full page)
        const firstPageReleases = Array.from({ length: 50 }, (_, i) => ({
            id: `r${i}`,
            name: `Release ${i}`,
            start_date: '2025-10-01',
            end_date: '2025-10-10',
        }));
        
        // Second page: 10 releases (partial page)
        const secondPageReleases = Array.from({ length: 10 }, (_, i) => ({
            id: `r${50 + i}`,
            name: `Release ${50 + i}`,
            start_date: '2025-10-01',
            end_date: '2025-10-10',
        }));
        
        mockGetReleases
            .mockResolvedValueOnce({ releases: firstPageReleases })
            .mockResolvedValueOnce({ releases: secondPageReleases })
            .mockResolvedValueOnce({ releases: [] }); // Third page empty
        
        mockGetReleaseEpics.mockResolvedValue({ epics: [{ id: 'e1' }] });
        
        const mockReq = {
            url: 'http://localhost/api/integrations/aha/sync-releases',
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(body.total_releases).toBe(60);
        expect(mockGetReleases).toHaveBeenCalledTimes(3); // 3 pages
    });

    it('should only sync releases that contain epics', async () => {
        mockGetReleases.mockResolvedValueOnce({
            releases: [
                { id: 'r1', name: 'Release With Epics', start_date: '2025-10-01', end_date: '2025-10-10' },
                { id: 'r2', name: 'Release Without Epics', start_date: '2025-11-01', end_date: '2025-11-10' },
            ],
        }).mockResolvedValueOnce({ releases: [] });
        
        // First release has epics, second doesn't
        mockGetReleaseEpics
            .mockResolvedValueOnce({ epics: [{ id: 'e1' }] }) // Release With Epics
            .mockResolvedValueOnce({ epics: [] }); // Release Without Epics
        
        const mockReq = {
            url: 'http://localhost/api/integrations/aha/sync-releases',
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(body.releases_with_epics).toBe(1);
        expect(body.synced).toBe(1);
        expect(mockSupabase.upsert).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully', async () => {
        mockGetReleases.mockRejectedValueOnce(new Error('Aha API error'));
        
        const mockReq = {
            url: 'http://localhost/api/integrations/aha/sync-releases',
        } as unknown as NextRequest;
        
        const res = await POST(mockReq);
        const body = await res.json();
        
        expect(res.status).toBe(500);
        expect(body.error).toBe('Failed to sync releases');
    });
});

