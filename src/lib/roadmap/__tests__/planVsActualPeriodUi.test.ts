import {
  clampPlanVsActualPeriodDate,
  defaultQuarterProgressWindowForQuarter,
  defaultQuarterStartDate,
  defaultSnapshotWindowForQuarter,
  isMonthInQuarter,
  monthsInQuarterOptions,
  planVsActualApiParams,
  quarterSelectOptions,
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

  it('defaultQuarterStartDate clamps to Q1 2026 when prior month is in Q4 2025', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-10T12:00:00'));
    expect(defaultQuarterStartDate()).toBe('2026-01-01');
    jest.useRealTimers();
  });

  it('quarterSelectOptions never lists a quarter before Q1 2026', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2027-06-15T12:00:00'));
    const opts = quarterSelectOptions();
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every((o) => o.value >= '2026-01-01')).toBe(true);
    expect(opts[opts.length - 1].value).toBe('2026-01-01');
    jest.useRealTimers();
  });

  it('clampPlanVsActualPeriodDate bumps quarterly anchors before Q1 2026', () => {
    expect(clampPlanVsActualPeriodDate('quarterly', '2025-10-15')).toBe('2026-01-01');
  });

  it('planVsActualApiParams clamps quarter start before Q1 2026', () => {
    expect(planVsActualApiParams('2025-10-01', 'quarter-plan')).toEqual({
      periodType: 'quarter_baseline',
      periodDate: '2026-01-01',
    });
  });
});
