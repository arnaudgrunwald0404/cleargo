import { describe, it, expect } from '@jest/globals';
import { resolveEpicGaDateYmd } from '../epic-ga-date';

const schedule = [
    { release_name: 'Release 2026.5', launch_date: '2026-05-14', cohort2_date: null },
    { release_name: 'Release 2026.6', launch_date: '2026-06-18', cohort2_date: null },
];

describe('resolveEpicGaDateYmd', () => {
    it('uses scheduled GA from Aha when set', () => {
        const result = resolveEpicGaDateYmd(
            {
                scheduled_ga_dev_date: '2026-07-01',
                target_launch_date: '2026-05-14',
                aha_fields: {
                    standard_fields: { aha_release_name: 'Release 2026.5' },
                },
            },
            { releaseSchedule: schedule }
        );
        expect(result).toBe('2026-07-01');
    });

    it('uses next release launch date for 5-week train (not Cohort 1 + 28)', () => {
        const result = resolveEpicGaDateYmd(
            {
                scheduled_ga_dev_date: null,
                target_launch_date: '2026-05-14',
                aha_fields: {
                    standard_fields: { aha_release_name: 'Release 2026.5' },
                },
            },
            { releaseSchedule: schedule }
        );
        expect(result).toBe('2026-06-18');
        expect(result).not.toBe('2026-06-11');
    });

    it('falls back to Cohort 1 + 28 when release is unknown', () => {
        const result = resolveEpicGaDateYmd(
            {
                scheduled_ga_dev_date: null,
                target_launch_date: '2026-05-14',
                aha_fields: null,
            },
            { releaseSchedule: schedule }
        );
        expect(result).toBe('2026-06-11');
    });

    it('prefers cohort2_date on release row over a closer intermediate release', () => {
        const scheduleWithOverride = [
            { release_name: 'Release 2026.5', launch_date: '2026-05-14', cohort2_date: '2026-06-18' },
            { release_name: 'Release 2026.5a', launch_date: '2026-05-28', cohort2_date: null },
        ];
        const result = resolveEpicGaDateYmd(
            {
                scheduled_ga_dev_date: null,
                target_launch_date: '2026-05-14',
                aha_fields: {
                    standard_fields: { aha_release_name: 'Release 2026.5' },
                },
            },
            { releaseSchedule: scheduleWithOverride }
        );
        expect(result).toBe('2026-06-18');
    });
});
