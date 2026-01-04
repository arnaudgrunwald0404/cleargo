/**
 * Tests for fetchAndUpsertReleaseFromAha helper function
 */

import { fetchAndUpsertReleaseFromAha } from '../epics';

// Mock Supabase - create mock inside factory to avoid hoisting issues
const mockSupabaseFactory = () => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    upsert: jest.fn().mockReturnThis(),
});

let mockSupabase: ReturnType<typeof mockSupabaseFactory>;

jest.mock('@supabase/supabase-js', () => {
    const actual = jest.requireActual('@supabase/supabase-js');
    mockSupabase = mockSupabaseFactory();
    return {
        ...actual,
        createClient: jest.fn(() => mockSupabase),
    };
});

// Mock Aha client
const mockGetReleases = jest.fn();

jest.mock('../../aha/client', () => ({
    getReleases: (...args: any[]) => mockGetReleases(...args),
}));

describe('fetchAndUpsertReleaseFromAha', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Default upsert mock
        mockSupabase.upsert.mockResolvedValue({ error: null });
    });

    it('should fetch release by exact name match', async () => {
        mockGetReleases.mockResolvedValueOnce({
            releases: [
                { id: 'r1', name: 'Release 2025.10', start_date: '2025-10-01', end_date: '2025-10-10' },
                { id: 'r2', name: 'Release 2026.1', start_date: '2026-01-01', end_date: '2026-01-15' },
            ],
        }).mockResolvedValueOnce({ releases: [] });
        
        const result = await fetchAndUpsertReleaseFromAha('Release 2025.10');
        
        expect(result).toBe('2025-10-10'); // Should return end_date
        expect(mockSupabase.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                release_name: 'Release 2025.10',
                launch_date: '2025-10-10',
            }),
            expect.any(Object)
        );
    });

    it('should fetch release by case-insensitive match if exact match fails', async () => {
        mockGetReleases.mockResolvedValueOnce({
            releases: [
                { id: 'r1', name: 'RELEASE 2025.10', start_date: '2025-10-01', end_date: '2025-10-10' },
            ],
        }).mockResolvedValueOnce({ releases: [] });
        
        const result = await fetchAndUpsertReleaseFromAha('Release 2025.10');
        
        expect(result).toBe('2025-10-10');
        expect(mockSupabase.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                release_name: 'RELEASE 2025.10',
                launch_date: '2025-10-10',
            }),
            expect.any(Object)
        );
    });

    it('should use start_date if end_date is not available', async () => {
        mockGetReleases.mockResolvedValueOnce({
            releases: [
                { id: 'r1', name: 'Release 2025.10', start_date: '2025-10-01', end_date: null },
            ],
        }).mockResolvedValueOnce({ releases: [] });
        
        const result = await fetchAndUpsertReleaseFromAha('Release 2025.10');
        
        expect(result).toBe('2025-10-01');
        expect(mockSupabase.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                launch_date: '2025-10-01',
            }),
            expect.any(Object)
        );
    });

    it('should return null and log warning if release has no date', async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        mockGetReleases.mockResolvedValueOnce({
            releases: [
                { id: 'r1', name: 'Release Without Date', start_date: null, end_date: null },
            ],
        }).mockResolvedValueOnce({ releases: [] });
        
        const result = await fetchAndUpsertReleaseFromAha('Release Without Date');
        
        expect(result).toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Release "Release Without Date" found in Aha but has no date')
        );
        expect(mockSupabase.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                launch_date: null,
            }),
            expect.any(Object)
        );
        
        consoleWarnSpy.mockRestore();
    });

    it('should return null if release not found in Aha', async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        mockGetReleases
            .mockResolvedValueOnce({ releases: [] })
            .mockResolvedValueOnce({ releases: [] }); // Second page also empty
        
        const result = await fetchAndUpsertReleaseFromAha('Non-existent Release');
        
        expect(result).toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Release "Non-existent Release" not found in Aha API')
        );
        expect(mockSupabase.upsert).not.toHaveBeenCalled();
        
        consoleWarnSpy.mockRestore();
    });

    it('should handle pagination when searching for release', async () => {
        // First page: 50 releases (doesn't contain target)
        const firstPageReleases = Array.from({ length: 50 }, (_, i) => ({
            id: `r${i}`,
            name: `Release ${i}`,
            start_date: '2025-10-01',
            end_date: '2025-10-10',
        }));
        
        // Second page: contains target release
        mockGetReleases
            .mockResolvedValueOnce({ releases: firstPageReleases })
            .mockResolvedValueOnce({
                releases: [
                    { id: 'r50', name: 'Target Release', start_date: '2025-11-01', end_date: '2025-11-15' },
                ],
            });
        
        const result = await fetchAndUpsertReleaseFromAha('Target Release');
        
        expect(result).toBe('2025-11-15');
        expect(mockGetReleases).toHaveBeenCalledTimes(2); // Should check second page
    });

    it('should throw error if upsert fails', async () => {
        mockGetReleases.mockResolvedValueOnce({
            releases: [
                { id: 'r1', name: 'Release 2025.10', start_date: '2025-10-01', end_date: '2025-10-10' },
            ],
        }).mockResolvedValueOnce({ releases: [] });
        
        mockSupabase.upsert.mockResolvedValue({
            error: { message: 'Database error' },
        });
        
        await expect(fetchAndUpsertReleaseFromAha('Release 2025.10')).rejects.toThrow();
    });

    it('should log auto-fetch action', async () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        
        mockGetReleases.mockResolvedValueOnce({
            releases: [
                { id: 'r1', name: 'Release 2025.10', start_date: '2025-10-01', end_date: '2025-10-10' },
            ],
        }).mockResolvedValueOnce({ releases: [] });
        
        await fetchAndUpsertReleaseFromAha('Release 2025.10');
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('Auto-fetching release "Release 2025.10" from Aha API')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('✅ Fetched release "Release 2025.10" with date: 2025-10-10')
        );
        
        consoleLogSpy.mockRestore();
    });
});

