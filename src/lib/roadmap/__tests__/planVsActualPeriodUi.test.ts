import {
  defaultQuarterProgressWindowForQuarter,
  defaultQuarterStartDate,
  defaultSnapshotWindowForQuarter,
  isMonthInQuarter,
  monthsInQuarterOptions,
  planVsActualApiParams,
} from '@/lib/roadmap/planVsActualPeriodUi';

describe('planVsActualPeriodUi', () => {
  it('isMonthInQuarter detects membership', () => {
    expect(isMonthInQuarter('2026-04-01', '2026-04-01')).toBe(true);
    expect(isMonthInQuarter('2026-06-01', '2026-04-01')).toBe(true);
    expect(isMonthInQuarter('2026-07-01', '2026-04-01')).toBe(false);
    expect(isMonthInQuarter('2026-03-01', '2026-04-01')).toBe(false);
  });

  it('monthsInQuarterOptions returns three months', () => {
    const opts = monthsInQuarterOptions('2026-04-01');
    expect(opts).toHaveLength(3);
    expect(opts.map((o) => o.value)).toEqual([
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
    ]);
  });

  it('defaultQuarterProgressWindowForQuarter maps prior month to progress slot in quarter', () => {
    const q = '2026-04-01';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-15T12:00:00'));
    expect(defaultQuarterProgressWindowForQuarter(q)).toBe('quarter-progress-1');
    jest.useRealTimers();
  });

  it('defaultQuarterProgressWindowForQuarter falls back to first progress month when prior month outside quarter', () => {
    const q = '2026-07-01';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-15T12:00:00'));
    expect(defaultQuarterProgressWindowForQuarter(q)).toBe('quarter-progress-1');
    jest.useRealTimers();
  });

  it('defaultSnapshotWindowForQuarter aliases quarter progress window', () => {
    const q = '2026-04-01';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-15T12:00:00'));
    expect(defaultSnapshotWindowForQuarter(q)).toBe('quarter-progress-1');
    jest.useRealTimers();
  });

  it('planVsActualApiParams maps windows to RPC types', () => {
    const q = '2026-04-01';
    expect(planVsActualApiParams(q, 'quarter-plan')).toEqual({
      periodType: 'quarter_baseline',
      periodDate: q,
    });
    expect(planVsActualApiParams(q, 'quarter-results')).toEqual({
      periodType: 'quarterly',
      periodDate: q,
    });
    const m = monthsInQuarterOptions(q);
    expect(planVsActualApiParams(q, 'quarter-progress-1')).toEqual({
      periodType: 'quarter_progress',
      periodDate: m[0].value,
    });
  });

  it('defaultQuarterStartDate uses quarter containing previous month', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-07T12:00:00'));
    expect(defaultQuarterStartDate()).toBe('2026-04-01');
    jest.useRealTimers();
  });
});
