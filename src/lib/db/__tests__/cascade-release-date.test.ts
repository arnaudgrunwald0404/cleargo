/**
 * Tests for cascadeReleaseDateToEpics helper function
 *
 * When a release date changes in the release_schedule table,
 * this function cascades the new date to all epics in that release,
 * updating their target_launch_date and recalculating criteria due dates.
 */

// Mock all external modules before importing the function under test.
// jest.mock is hoisted above imports, so we define the mock implementation inline.

// Use a shared object to hold mock state (avoids hoisting issues with const/let)
const mocks = {} as any;

jest.mock('@supabase/supabase-js', () => {
    // Create a proxy-based mock that delegates to mocks.fromImpl at call time
    const mockFrom = (...args: any[]) => {
        if (mocks.fromImpl) return mocks.fromImpl(...args);
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    };
    return {
        createClient: jest.fn(() => ({ from: mockFrom })),
    };
});

jest.mock('../../aha/client', () => ({
    getReleases: jest.fn(),
}));

jest.mock('../../ai/client', () => ({
    pruneCriteria: jest.fn(),
}));

jest.mock('../../flags', () => ({
    isEnabled: jest.fn().mockReturnValue(false),
    FEATURE_AI_PRUNING: 'ai_pruning',
}));

jest.mock('../../settings-db', () => ({
    getFeatureFlags: jest.fn().mockResolvedValue({}),
    getSettings: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../slack/notifications', () => ({
    syncUserSlackHandle: jest.fn(),
    sendSlackNotification: jest.fn(),
    canReceiveSlackNotification: jest.fn(),
}));

jest.mock('../../jira/resolve-and-cache-epic-key', () => ({
    resolveAndCacheJiraEpicKey: jest.fn(),
}));

import { cascadeReleaseDateToEpics } from '../epics';

// Helper: standard mock for release_stages
const mockReleaseStages = [
    { id: 1, name: 'Product Definition', sort_order: 1, duration_days: 31, level_durations: null, scope: 'release_schedule' },
    { id: 2, name: 'GTM Access and Prep', sort_order: 2, duration_days: 14, level_durations: null, scope: 'release_schedule' },
    { id: 3, name: 'Internal Readiness', sort_order: 3, duration_days: 21, level_durations: null, scope: 'release_schedule' },
    { id: 4, name: 'Cohort 1', sort_order: 4, duration_days: 28, level_durations: null, scope: 'release_schedule' },
];

function setupMocks(options: {
    epics?: any[] | null;
    queryError?: any;
    updateErrors?: Record<string, any>;
}) {
    const { epics = [], queryError = null, updateErrors = {} } = options;

    mocks.fromImpl = (table: string) => {
        if (table === 'epic') {
            return {
                select: jest.fn().mockReturnValue({
                    or: jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({ data: epics, error: queryError }),
                    }),
                    eq: jest.fn().mockImplementation((_field: string, id: string) => ({
                        single: jest.fn().mockResolvedValue({
                            data: (epics || []).find((e: any) => e.id === id) ?? epics?.[0] ?? null,
                            error: null,
                        }),
                    })),
                }),
                update: jest.fn().mockImplementation(() => ({
                    eq: jest.fn().mockImplementation((_field: string, id: string) => {
                        const err = updateErrors[id] || null;
                        return Promise.resolve({ error: err });
                    }),
                })),
            };
        }
        if (table === 'epic_criterion_status') {
            return {
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            };
        }
        if (table === 'release_stages') {
            return {
                select: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({ data: mockReleaseStages, error: null }),
                }),
            };
        }
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    };
}

describe('cascadeReleaseDateToEpics', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mocks.fromImpl = null;
    });

    it('should return zeros when no epics match the release', async () => {
        setupMocks({ epics: [] });

        const result = await cascadeReleaseDateToEpics('Release 2026.99', '2026-12-01');

        expect(result.updated).toBe(0);
        expect(result.errors).toHaveLength(0);
    });

    it('should update target_launch_date and recalculate due dates for matching epics', async () => {
        setupMocks({
            epics: [
                { id: 'epic-1', name: 'Epic One', aha_id: 'AHA-1', target_launch_date: '2026-01-15', aha_fields: null },
                { id: 'epic-2', name: 'Epic Two', aha_id: 'AHA-2', target_launch_date: '2026-01-15', aha_fields: null },
            ],
        });

        const result = await cascadeReleaseDateToEpics('Release 2026.5', '2026-05-01');

        expect(result.updated).toBe(2);
        expect(result.errors).toHaveLength(0);
    });

    it('should skip target_launch_date update when date already matches but still recalculate', async () => {
        setupMocks({
            epics: [
                { id: 'epic-1', name: 'Epic One', aha_id: 'AHA-1', target_launch_date: '2026-05-01', aha_fields: null },
            ],
        });

        const result = await cascadeReleaseDateToEpics('Release 2026.5', '2026-05-01');

        // Should still count as updated (due dates recalculated)
        expect(result.updated).toBe(1);
    });

    it('should throw when the epic query fails', async () => {
        setupMocks({
            epics: null,
            queryError: { message: 'Connection failed', code: 'TIMEOUT' },
        });

        await expect(
            cascadeReleaseDateToEpics('Release 2026.5', '2026-05-01')
        ).rejects.toThrow('Failed to query epics for release');
    });

    it('should continue processing remaining epics when one update fails', async () => {
        setupMocks({
            epics: [
                { id: 'epic-1', name: 'Epic One', aha_id: 'AHA-1', target_launch_date: '2026-01-15', aha_fields: null },
                { id: 'epic-2', name: 'Epic Two', aha_id: 'AHA-2', target_launch_date: '2026-01-15', aha_fields: null },
            ],
            updateErrors: {
                'epic-1': { message: 'RLS violation' },
            },
        });

        const result = await cascadeReleaseDateToEpics('Release 2026.5', '2026-05-01');

        // First epic fails, second succeeds
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
        expect(result.errors[0]).toContain('epic-1');
        expect(result.updated).toBe(1);
    });
});
