import { describe, it, expect } from '@jest/globals';
import {
  mergeReleaseScheduleRows,
  mergeReleaseScheduleApiResponse,
  type ReleaseScheduleRow,
} from '../release-schedule-merge';

const base: ReleaseScheduleRow[] = [
  {
    id: 1,
    release_name: 'Release 2026.8',
    launch_date: '2026-09-17',
    cohort2_date: null,
    archived: false,
  },
];

describe('mergeReleaseScheduleApiResponse', () => {
  it('preserves launch_date when incoming row has null', () => {
    const incoming: ReleaseScheduleRow[] = [
      { id: 1, release_name: 'Release 2026.8', launch_date: null, cohort2_date: null, archived: false },
    ];
    const merged = mergeReleaseScheduleApiResponse(base, incoming);
    expect(merged[0].launch_date).toBe('2026-09-17');
  });

  it('accepts newer non-null dates from incoming', () => {
    const incoming: ReleaseScheduleRow[] = [
      {
        id: 1,
        release_name: 'Release 2026.8',
        launch_date: '2026-10-01',
        cohort2_date: '2026-10-29',
        archived: false,
      },
    ];
    const merged = mergeReleaseScheduleApiResponse(base, incoming);
    expect(merged[0].launch_date).toBe('2026-10-01');
    expect(merged[0].cohort2_date).toBe('2026-10-29');
  });
});

describe('mergeReleaseScheduleRows', () => {
  it('patches launch_date onto matching release', () => {
    const merged = mergeReleaseScheduleRows(base, [
      { release_name: 'Release 2026.8', launch_date: '2026-09-20' },
    ]);
    expect(merged[0].launch_date).toBe('2026-09-20');
  });
});
