import { describe, it, expect } from '@jest/globals';
import { getCohort2DateForTimeline } from '../date-utils';

describe('getCohort2DateForTimeline', () => {
    const schedule = [
        { release_name: 'Release 2026.5', launch_date: '2026-05-14', cohort2_date: null },
        { release_name: 'Release 2026.6', launch_date: '2026-06-18', cohort2_date: null },
        { release_name: 'Release 2026.7', launch_date: '2026-07-16', cohort2_date: null },
    ];

    it('returns cohort2_date from DB when present — this was the bug', () => {
        const scheduleWithC2 = schedule.map(r =>
            r.release_name === 'Release 2026.5'
                ? { ...r, cohort2_date: '2026-06-18' }
                : r
        );
        const result = getCohort2DateForTimeline('Release 2026.5', '2026-05-14', scheduleWithC2);
        expect(result).toBe('2026-06-18');
    });

    it('falls back to next release launch_date when cohort2_date is null', () => {
        const result = getCohort2DateForTimeline('Release 2026.5', '2026-05-14', schedule);
        // Next release after May 14 is June 18
        expect(result).toBe('2026-06-18');
    });

    it('does not use the current release as the cohort 2 date', () => {
        const result = getCohort2DateForTimeline('Release 2026.6', '2026-06-18', schedule);
        // Next release after June 18 is July 16, not June 18 itself
        expect(result).toBe('2026-07-16');
    });

    it('does not use releases before the anchor as cohort 2', () => {
        const result = getCohort2DateForTimeline('Release 2026.6', '2026-06-18', schedule);
        // May 14 is before June 18 — must not be returned
        expect(result).not.toBe('2026-05-14');
    });

    it('falls back to +1 calendar month when no later release exists', () => {
        const singleSchedule = [{ release_name: 'Release 2026.7', launch_date: '2026-07-16', cohort2_date: null }];
        const result = getCohort2DateForTimeline('Release 2026.7', '2026-07-16', singleSchedule);
        // Fallback: +1 month = 2026-08-16
        expect(result).toBe('2026-08-16');
    });

    it('ignores non-standard release trains when picking next cohort 2 date', () => {
        const scheduleWithOneOff = [
            { release_name: 'Release 2026.6', launch_date: '2026-06-18', cohort2_date: null },
            { release_name: 'HRSG Competencies Sunset', launch_date: '2026-07-01', cohort2_date: null },
            { release_name: 'Release 2026.7', launch_date: '2026-07-16', cohort2_date: null },
        ];
        const result = getCohort2DateForTimeline('Release 2026.6', '2026-06-18', scheduleWithOneOff);
        expect(result).toBe('2026-07-16');
    });

    it('cohort2_date takes priority over a closer next release', () => {
        const scheduleWithC2 = [
            { release_name: 'Release 2026.5', launch_date: '2026-05-14', cohort2_date: '2026-06-18' },
            { release_name: 'Release 2026.5a', launch_date: '2026-05-28', cohort2_date: null },
        ];
        // Without cohort2_date the next release (May 28) would win, but cohort2_date overrides
        const result = getCohort2DateForTimeline('Release 2026.5', '2026-05-14', scheduleWithC2);
        expect(result).toBe('2026-06-18');
    });
});
