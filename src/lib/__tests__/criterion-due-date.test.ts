import {
    computeCriterionDueDateYmd,
    resolveAnchorLaunchDateFromReleaseSchedule,
} from '../criterion-due-date';

describe('resolveAnchorLaunchDateFromReleaseSchedule', () => {
    it('uses release_schedule launch_date when release name matches', () => {
        const anchor = resolveAnchorLaunchDateFromReleaseSchedule(
            'Release 2026.6',
            [{ release_name: 'Release 2026.6', launch_date: '2026-06-15' }],
            '2026-06-01'
        );
        expect(anchor).toBe('2026-06-15');
    });

    it('falls back to epic target_launch_date when no schedule row', () => {
        const anchor = resolveAnchorLaunchDateFromReleaseSchedule(
            'Unknown Release',
            [{ release_name: 'Release 2026.6', launch_date: '2026-06-15' }],
            '2026-07-01'
        );
        expect(anchor).toBe('2026-07-01');
    });
});

describe('computeCriterionDueDateYmd', () => {
    const stages = [
        { id: 1, name: 'Product Definition', sort_order: 1, duration_days: 31, level_durations: null, scope: 'release_schedule' },
        { id: 2, name: 'GTM Access and Prep', sort_order: 2, duration_days: 14, level_durations: null, scope: 'release_schedule' },
        { id: 3, name: 'Internal Readiness', sort_order: 3, duration_days: 21, level_durations: null, scope: 'release_schedule' },
        { id: 4, name: 'Cohort 1', sort_order: 4, duration_days: 28, level_durations: null, scope: 'release_schedule' },
    ];

    it('returns null when anchor is null', () => {
        expect(
            computeCriterionDueDateYmd({
                anchorYmd: null,
                ratingTimingId: 1,
                allStages: stages,
            })
        ).toBeNull();
    });

    it('computes a pre-launch due date from anchor and rating_timing', () => {
        const ymd = computeCriterionDueDateYmd({
            anchorYmd: '2026-06-30',
            ratingTimingId: 1,
            allStages: stages,
        });
        expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(ymd).not.toBe('2026-06-30');
    });
});
