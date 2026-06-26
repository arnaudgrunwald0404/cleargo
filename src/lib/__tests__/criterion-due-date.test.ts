import {
    applyGateStageDueOffset,
    buildCategoryStageFallbackMap,
    computeCriterionDueDateYmd,
    GATE_STAGE_DUE_OFFSET_DAYS,
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

describe('buildCategoryStageFallbackMap', () => {
    const stages = [
        { id: 1, name: 'Product Definition Complete' },
        { id: 2, name: 'GTM Access and Prep' },
        { id: 3, name: 'Internal Readiness' },
        { id: 4, name: 'Cohort 1' },
    ];

    it('maps support-style categories to GTM Access and Prep for release schedule', () => {
        const map = buildCategoryStageFallbackMap(stages, false);
        expect(map.get('support')).toBe(2);
        expect(map.get('data_analytics')).toBe(2);
        expect(map.get('implementation scale & customer adoption')).toBe(4);
    });
});

describe('applyGateStageDueOffset', () => {
    it('subtracts gate vs sub offsets in calendar days', () => {
        const end = '2026-06-15';
        expect(applyGateStageDueOffset(end, true, false)).toBe('2026-06-14');
        expect(applyGateStageDueOffset(end, false, false)).toBe('2026-06-11');
    });
});

describe('computeCriterionDueDateYmd', () => {
    const stages = [
        { id: 1, name: 'Product Definition Complete', sort_order: 1, duration_days: 31, level_durations: null, scope: 'release_schedule', is_gate: false },
        { id: 2, name: 'GTM Access and Prep', sort_order: 2, duration_days: 14, level_durations: null, scope: 'release_schedule', is_gate: true },
        { id: 3, name: 'Internal Readiness', sort_order: 3, duration_days: 21, level_durations: null, scope: 'release_schedule', is_gate: false },
        { id: 4, name: 'Cohort 1', sort_order: 4, duration_days: 28, level_durations: null, scope: 'release_schedule', is_gate: false },
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

    it('uses segment end for non-gate stages', () => {
        const ymd = computeCriterionDueDateYmd({
            anchorYmd: '2026-06-30',
            ratingTimingId: 1,
            allStages: stages,
        });
        expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(ymd).not.toBe('2026-06-30');
    });

    it('applies cascading offsets on gate stages', () => {
        const gateEnd = computeCriterionDueDateYmd({
            anchorYmd: '2026-06-30',
            ratingTimingId: 2,
            allStages: stages,
            isGateCriterion: true,
        });
        const subDue = computeCriterionDueDateYmd({
            anchorYmd: '2026-06-30',
            ratingTimingId: 2,
            allStages: stages,
            isGateCriterion: false,
        });
        expect(gateEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(subDue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(gateEnd).not.toBe(subDue);
        const gateDate = new Date(gateEnd!);
        const subDate = new Date(subDue!);
        const diffDays = Math.round((gateDate.getTime() - subDate.getTime()) / (1000 * 60 * 60 * 24));
        expect(diffDays).toBe(GATE_STAGE_DUE_OFFSET_DAYS.sub - GATE_STAGE_DUE_OFFSET_DAYS.gate);
    });
});
