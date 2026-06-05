import {
  parseRolloutProcess,
  getRolloutProcess,
  isSingleGaRollout,
  shouldShowCohort1Column,
  getRolloutAwareCohort1Ymd,
  getRolloutAwareGaYmd,
  getCohort1CellShading,
  getGaCellShading,
  isRolloutGaFromOffSchedule,
} from '@/lib/epic-rollout-process';

const dualEpic = {
  target_launch_date: '2026-08-20',
  scheduled_ga_dev_date: null,
  aha_fields: { custom_fields: { rollout_process: 'Dual Cohort' } },
};

const singleGaEpic = {
  target_launch_date: '2026-09-17',
  scheduled_ga_dev_date: '2026-09-17',
  aha_fields: { custom_fields: { rollout_process: 'Single GA' } },
};

const singleGaOffSchedule = {
  target_launch_date: '2026-09-17',
  scheduled_ga_dev_date: null,
  aha_fields: {
    custom_fields: {
      rollout_process: 'Single GA',
      off_schedule_release_date: '2026-10-01',
    },
  },
};

const missingRollout = {
  target_launch_date: '2026-08-20',
  scheduled_ga_dev_date: null,
  aha_fields: { custom_fields: {} },
};

describe('parseRolloutProcess', () => {
  it('maps Single GA variants', () => {
    expect(parseRolloutProcess('Single GA')).toBe('single_ga');
    expect(parseRolloutProcess('single_ga')).toBe('single_ga');
  });

  it('defaults unknown to dual_cohort', () => {
    expect(parseRolloutProcess(null)).toBe('dual_cohort');
    expect(parseRolloutProcess('')).toBe('dual_cohort');
    expect(parseRolloutProcess('Other')).toBe('dual_cohort');
  });
});

describe('rollout column visibility', () => {
  it('hides Cohort 1 for Single GA', () => {
    expect(shouldShowCohort1Column(singleGaEpic)).toBe(false);
    expect(getRolloutAwareCohort1Ymd(singleGaEpic, '2026-09-17')).toBeNull();
  });

  it('shows Cohort 1 for Dual Cohort', () => {
    expect(shouldShowCohort1Column(dualEpic)).toBe(true);
    expect(getRolloutAwareCohort1Ymd(dualEpic, '2026-08-20')).toBe('2026-08-20');
  });

  it('defaults missing rollout_process to Dual Cohort', () => {
    expect(isSingleGaRollout(missingRollout)).toBe(false);
    expect(getRolloutAwareCohort1Ymd(missingRollout, '2026-08-20')).toBe('2026-08-20');
  });
});

describe('off-schedule routing', () => {
  it('routes off-schedule to GA for Single GA', () => {
    expect(isRolloutGaFromOffSchedule(singleGaOffSchedule)).toBe(true);
    expect(getRolloutAwareGaYmd(singleGaOffSchedule)).toBe('2026-10-01');
    expect(getGaCellShading(singleGaOffSchedule, true)).toBe('off-schedule');
  });

  it('does not shade Cohort 1 when it matches the release train', () => {
    expect(getCohort1CellShading(dualEpic, true, '2026-08-20')).toBe('none');
  });

  it('highlights Cohort 1 when it differs from the release train', () => {
    expect(getCohort1CellShading(dualEpic, true, '2026-07-16')).toBe('off-schedule');
  });

  it('does not shade GA when it matches the release train', () => {
    expect(getGaCellShading(dualEpic, true, '2026-09-17', '2026-09-17')).toBe('none');
  });

  it('highlights GA when it differs from the release train', () => {
    expect(getGaCellShading(dualEpic, true, '2026-08-20', '2026-09-17')).toBe('off-schedule');
  });
});

describe('getRolloutProcess', () => {
  it('reads from aha_fields', () => {
    expect(getRolloutProcess(singleGaEpic)).toBe('single_ga');
    expect(getRolloutProcess(dualEpic)).toBe('dual_cohort');
  });
});
