import {
  launchCriterionApplies,
  tMinusDueDate,
  resolveOffsetDays,
  tierAwareDueDate,
  normalizeTierOffsets,
} from '../launchCriteria';

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

describe('resolveOffsetDays', () => {
  const storyBrief = {
    default_due_offset_days: 56,
    tier_offset_days: { TIER_1: 56, TIER_2: 35, TIER_3: 14 },
  };

  it('prefers the per-tier offset over the fallback', () => {
    expect(resolveOffsetDays(storyBrief, 'TIER_1')).toBe(56);
    expect(resolveOffsetDays(storyBrief, 'TIER_2')).toBe(35);
    expect(resolveOffsetDays(storyBrief, 'TIER_3')).toBe(14);
  });

  it('falls back when the tier has no entry', () => {
    // Campaign Brief is Tier 1 only; a Tier 2 launch never instantiates it, but
    // the resolver must still answer rather than throw.
    const campaign = { default_due_offset_days: 21, tier_offset_days: { TIER_1: 21 } };
    expect(resolveOffsetDays(campaign, 'TIER_2')).toBe(21);
  });

  it('falls back for the 51 criteria that have no per-tier override', () => {
    expect(resolveOffsetDays({ default_due_offset_days: 42, tier_offset_days: null }, 'TIER_2')).toBe(42);
    expect(resolveOffsetDays({ default_due_offset_days: 42 }, 'TIER_1')).toBe(42);
  });

  it('falls back when the launch has no tier yet', () => {
    expect(resolveOffsetDays(storyBrief, null)).toBe(56);
    expect(resolveOffsetDays(storyBrief, undefined)).toBe(56);
  });

  it('returns null when neither source has a number', () => {
    expect(resolveOffsetDays({ default_due_offset_days: null, tier_offset_days: null }, 'TIER_1')).toBeNull();
    expect(resolveOffsetDays({}, 'TIER_1')).toBeNull();
  });

  it('ignores non-numeric per-tier values rather than trusting jsonb', () => {
    const junk = { default_due_offset_days: 30, tier_offset_days: { TIER_1: NaN } as any };
    expect(resolveOffsetDays(junk, 'TIER_1')).toBe(30);
  });
});

describe('tierAwareDueDate', () => {
  // The workback slide: 2026.10 GA is Oct 14. T1 gets ~8wk, T2 ~5wk.
  const storyBrief = {
    default_due_offset_days: 56,
    tier_offset_days: { TIER_1: 56, TIER_2: 35 },
  };

  it('gives the same artifact different dates per tier', () => {
    expect(tierAwareDueDate('2026-10-14', storyBrief, 'TIER_1')).toBe('2026-08-19');
    expect(tierAwareDueDate('2026-10-14', storyBrief, 'TIER_2')).toBe('2026-09-09');
  });

  it('is null without a launch date', () => {
    expect(tierAwareDueDate(null, storyBrief, 'TIER_1')).toBeNull();
  });
});

describe('normalizeTierOffsets', () => {
  it('keeps known tiers with integer day counts', () => {
    expect(normalizeTierOffsets({ TIER_1: 56, TIER_2: 35 })).toEqual({ TIER_1: 56, TIER_2: 35 });
  });

  it('coerces numeric strings from form inputs', () => {
    expect(normalizeTierOffsets({ TIER_1: '56' })).toEqual({ TIER_1: 56 });
  });

  it('drops unknown keys and non-numeric values', () => {
    expect(normalizeTierOffsets({ TIER_1: 56, TIER_9: 10, evil: 'x', TIER_2: 'abc' })).toEqual({ TIER_1: 56 });
  });

  it('collapses empty or malformed input to null', () => {
    expect(normalizeTierOffsets({})).toBeNull();
    expect(normalizeTierOffsets({ TIER_1: '' })).toBeNull();
    expect(normalizeTierOffsets(null)).toBeNull();
    expect(normalizeTierOffsets('nope')).toBeNull();
    expect(normalizeTierOffsets([56, 35])).toBeNull();
  });
});
