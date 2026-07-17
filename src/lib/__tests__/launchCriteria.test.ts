import { launchCriterionApplies, tMinusDueDate } from '../launchCriteria';

describe('launchCriterionApplies', () => {
  it('applies ALL criteria to every tier', () => {
    expect(launchCriterionApplies('ALL', 'TIER_1')).toBe(true);
    expect(launchCriterionApplies('ALL', 'TIER_2')).toBe(true);
    expect(launchCriterionApplies('ALL', null)).toBe(true);
  });

  it('matches comma-separated tier lists', () => {
    expect(launchCriterionApplies('TIER_1,TIER_2', 'TIER_2')).toBe(true);
    expect(launchCriterionApplies('TIER_1', 'TIER_2')).toBe(false);
    expect(launchCriterionApplies('TIER_1, TIER_2', 'TIER_2')).toBe(true);
  });

  it('gives untier-ed launches the full battery', () => {
    expect(launchCriterionApplies('TIER_1', null)).toBe(true);
    expect(launchCriterionApplies('TIER_1', undefined)).toBe(true);
  });
});

describe('tMinusDueDate', () => {
  it('subtracts the offset from the target date', () => {
    expect(tMinusDueDate('2026-10-01', 60)).toBe('2026-08-02');
    expect(tMinusDueDate('2026-10-15', 56)).toBe('2026-08-20');
    expect(tMinusDueDate('2026-10-15', 0)).toBe('2026-10-15');
  });

  it('crosses month and year boundaries', () => {
    expect(tMinusDueDate('2026-01-10', 20)).toBe('2025-12-21');
  });

  it('returns null without an anchor or offset', () => {
    expect(tMinusDueDate(null, 30)).toBeNull();
    expect(tMinusDueDate('2026-10-01', null)).toBeNull();
    expect(tMinusDueDate('not-a-date', 30)).toBeNull();
  });
});
