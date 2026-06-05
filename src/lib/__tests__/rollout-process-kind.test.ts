import {
  parseRolloutProcess,
  normalizeRolloutProcessRaw,
} from '@/lib/rollout-process-kind';

describe('normalizeRolloutProcessRaw', () => {
  it('reads string picklist values', () => {
    expect(normalizeRolloutProcessRaw('Single GA')).toBe('Single GA');
  });

  it('reads object picklist values without confusing field label', () => {
    expect(normalizeRolloutProcessRaw({ value: 'Single GA', name: 'Rollout Process' })).toBe(
      'Single GA'
    );
  });

  it('reads array picklist values', () => {
    expect(normalizeRolloutProcessRaw(['Dual Cohort'])).toBe('Dual Cohort');
  });
});

describe('parseRolloutProcess', () => {
  it('parses object-shaped stored values', () => {
    expect(parseRolloutProcess({ value: 'Single GA' })).toBe('single_ga');
  });
});
