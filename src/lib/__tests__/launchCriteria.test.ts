import {
  launchCriterionApplies,
  tMinusDueDate,
  resolveOffsetDays,
  tierAwareDueDate,
  normalizeTierOffsets,
  resolveCriterionOwner,
  LAUNCH_OWNER_PLACEHOLDER,
  runwayDueOffsetDays,
  scheduleState,
  normalizeGate,
  normalizeTierApplicability,
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
    // Message Brief carries no TIER_3 offset (T3 gets a light Story Brief and a
    // release note, nothing further), so a T3 lookup must still answer rather
    // than throw — membership filtering, not this resolver, keeps it off the list.
    const message = { default_due_offset_days: 42, tier_offset_days: { TIER_1: 42, TIER_2: 28 } };
    expect(resolveOffsetDays(message, 'TIER_3')).toBe(42);
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

describe('resolveCriterionOwner', () => {
  it('resolves the PMM placeholder to the launch owner', () => {
    expect(resolveCriterionOwner(LAUNCH_OWNER_PLACEHOLDER, 'kpenney@clearcompany.com')).toBe(
      'kpenney@clearcompany.com'
    );
  });

  it('returns null when the launch has no owner yet', () => {
    expect(resolveCriterionOwner(LAUNCH_OWNER_PLACEHOLDER, null)).toBeNull();
  });

  it('never leaks a placeholder string into an email column', () => {
    // The Story Brief is owned by the PM, but a launch bundles epics across
    // pods and so has no single PM — the intent stays visible in admin while
    // the instantiated row is left unassigned.
    expect(resolveCriterionOwner("[name of pod's product manager]", 'kp@x.com')).toBeNull();
  });

  it('passes real addresses through untouched', () => {
    expect(resolveCriterionOwner('dpope@clearcompany.com', 'kp@x.com')).toBe('dpope@clearcompany.com');
  });

  it('is null for criteria with no default owner', () => {
    expect(resolveCriterionOwner(null, 'kp@x.com')).toBeNull();
    expect(resolveCriterionOwner(undefined, 'kp@x.com')).toBeNull();
  });
});

describe('the confirmed workback standard', () => {
  // Kristin Penney, 2026-08-19. Each number is where the artifact must START,
  // counted back from the release date.
  const RUNWAY = [
    { artifact: 'Story Brief', TIER_1: 56, TIER_2: 35 },
    { artifact: 'Message Brief', TIER_1: 42, TIER_2: 28 },
    { artifact: 'Enablement Brief', TIER_1: 28, TIER_2: 21 },
    { artifact: 'Campaign Brief', TIER_1: 21, TIER_2: 14 },
    { artifact: 'Supporting Assets', TIER_1: 14, TIER_2: 7 },
  ];

  it.each(['TIER_1', 'TIER_2'] as const)('%s stays strictly ordered down the chain', (tier) => {
    const offsets = RUNWAY.map((r) => resolveOffsetDays({ tier_offset_days: r }, tier));
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]!).toBeLessThan(offsets[i - 1]!);
    }
  });

  it('places every T2 artifact no earlier than its T1 counterpart', () => {
    for (const r of RUNWAY) {
      expect(resolveOffsetDays({ tier_offset_days: r }, 'TIER_2')!).toBeLessThanOrEqual(
        resolveOffsetDays({ tier_offset_days: r }, 'TIER_1')!
      );
    }
  });

  it('lands the 2026.10 release (Oct 14) on the dates the workback implies', () => {
    const story = { tier_offset_days: { TIER_1: 56, TIER_2: 35 } };
    expect(tierAwareDueDate('2026-10-14', story, 'TIER_1')).toBe('2026-08-19');
    expect(tierAwareDueDate('2026-10-14', story, 'TIER_2')).toBe('2026-09-09');
  });
});

describe('runwayDueOffsetDays', () => {
  // The seeded runway: each node starts where tier_offset_days says, and is due
  // when its successor starts.
  const RUNWAY: any[] = [
    { id: 'gate1', tier_applicability: 'ALL', tier_offset_days: { TIER_1: 63, TIER_2: 42 }, depends_on_criterion_id: null },
    { id: 'gate2', tier_applicability: 'ALL', tier_offset_days: { TIER_1: 63, TIER_2: 42 }, depends_on_criterion_id: 'gate1' },
    { id: 'story', tier_applicability: 'ALL', tier_offset_days: { TIER_1: 56, TIER_2: 35 }, depends_on_criterion_id: 'gate2' },
    { id: 'message', tier_applicability: 'TIER_1,TIER_2', tier_offset_days: { TIER_1: 42, TIER_2: 28 }, depends_on_criterion_id: 'story' },
    { id: 'enable', tier_applicability: 'TIER_1,TIER_2', tier_offset_days: { TIER_1: 28, TIER_2: 21 }, depends_on_criterion_id: 'message' },
    { id: 'camp', tier_applicability: 'TIER_1,TIER_2', tier_offset_days: { TIER_1: 21, TIER_2: 14 }, depends_on_criterion_id: 'enable' },
    { id: 'assets', tier_applicability: 'TIER_1,TIER_2', tier_offset_days: { TIER_1: 14, TIER_2: 7 }, depends_on_criterion_id: 'camp' },
  ];
  const at = (id: string) => RUNWAY.find((r) => r.id === id)!;
  const due = (id: string, tier: string) => runwayDueOffsetDays(at(id), RUNWAY, tier);

  it('makes each artifact due when its successor starts (T1)', () => {
    expect(due('gate2', 'TIER_1')).toBe(56); // due when the Story Brief starts
    expect(due('story', 'TIER_1')).toBe(42); // due when the Message Brief starts
    expect(due('message', 'TIER_1')).toBe(28);
    expect(due('enable', 'TIER_1')).toBe(21);
    expect(due('camp', 'TIER_1')).toBe(14);
  });

  it('makes each artifact due when its successor starts (T2)', () => {
    expect(due('gate2', 'TIER_2')).toBe(35);
    expect(due('story', 'TIER_2')).toBe(28);
    expect(due('message', 'TIER_2')).toBe(21);
    expect(due('enable', 'TIER_2')).toBe(14);
    expect(due('camp', 'TIER_2')).toBe(7);
  });

  it('leaves the tail of the runway due at its own offset', () => {
    expect(due('assets', 'TIER_1')).toBe(14);
    expect(due('assets', 'TIER_2')).toBe(7);
  });

  it('leaves the 51 pre-workback criteria completely unchanged', () => {
    const legacy = { id: 'legacy', default_due_offset_days: 24, depends_on_criterion_id: null };
    expect(runwayDueOffsetDays(legacy, [...RUNWAY, legacy], 'TIER_1')).toBe(24);
  });

  it('skips a successor that does not apply to this tier', () => {
    // If Campaign were Tier 1 only, a Tier 2 Enablement must not inherit its date.
    const t1OnlyCamp = RUNWAY.map((r) => (r.id === 'camp' ? { ...r, tier_applicability: 'TIER_1' } : r));
    const enable = t1OnlyCamp.find((r) => r.id === 'enable')!;
    expect(runwayDueOffsetDays(enable, t1OnlyCamp, 'TIER_2')).toBe(21); // its own offset
    expect(runwayDueOffsetDays(enable, t1OnlyCamp, 'TIER_1')).toBe(21); // camp starts at 21
  });

  it('never derives a due date earlier than the artifact starts', () => {
    for (const tier of ['TIER_1', 'TIER_2']) {
      for (const node of RUNWAY) {
        const start = resolveOffsetDays(node, tier)!;
        expect(runwayDueOffsetDays(node, RUNWAY, tier)!).toBeLessThanOrEqual(start);
      }
    }
  });
});

describe('scheduleState', () => {
  it('calls it compressed when the window closed before the launch existed', () => {
    // Kristin's 2026.8 case: release lands closer than the T1 runway needs.
    expect(
      scheduleState({
        startDate: '2026-06-24',
        dueDate: '2026-07-08',
        today: '2026-08-19',
        launchCreatedAt: '2026-08-01T09:00:00Z',
      })
    ).toBe('compressed');
  });

  it('prefers compressed over late — the artifact predates the window, it is not missing', () => {
    const args = { startDate: '2026-06-24', dueDate: '2026-06-30', today: '2026-08-19' };
    expect(scheduleState({ ...args, launchCreatedAt: '2026-08-01T09:00:00Z' })).toBe('compressed');
    // Same dates, but the launch existed in time — that really is late.
    expect(scheduleState({ ...args, launchCreatedAt: '2026-06-01T09:00:00Z' })).toBe('late');
  });

  it('reports upcoming, in-window and late across the artifact window', () => {
    const w = { startDate: '2026-09-01', dueDate: '2026-09-15', launchCreatedAt: '2026-08-01T09:00:00Z' };
    expect(scheduleState({ ...w, today: '2026-08-20' })).toBe('upcoming');
    expect(scheduleState({ ...w, today: '2026-09-01' })).toBe('in_window');
    expect(scheduleState({ ...w, today: '2026-09-10' })).toBe('in_window');
    expect(scheduleState({ ...w, today: '2026-09-15' })).toBe('in_window');
    expect(scheduleState({ ...w, today: '2026-09-16' })).toBe('late');
  });

  it('is no_date when the criterion carries no schedule at all', () => {
    // Gate 3 (beta) is seeded deliberately dateless.
    expect(scheduleState({ startDate: null, dueDate: null, today: '2026-08-19' })).toBe('no_date');
  });

  it('does not claim compression when the launch creation date is unknown', () => {
    expect(scheduleState({ startDate: '2026-06-24', dueDate: '2026-06-30', today: '2026-08-19' })).toBe('late');
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

describe('normalizeGate', () => {
  it('accepts the legacy hard/soft strings the admin UI sends', () => {
    // criterion.gate is boolean; sending 'hard' fails the write with 22P02
    // "invalid input syntax for type boolean", which silently broke every save
    // from Admin > Settings > Launch Criteria.
    expect(normalizeGate('hard')).toBe(true);
    expect(normalizeGate('soft')).toBe(false);
  });

  it('passes booleans through', () => {
    expect(normalizeGate(true)).toBe(true);
    expect(normalizeGate(false)).toBe(false);
  });

  it('defaults to non-gating for anything unrecognised', () => {
    expect(normalizeGate(null)).toBe(false);
    expect(normalizeGate(undefined)).toBe(false);
    expect(normalizeGate({})).toBe(false);
    expect(normalizeGate('nonsense')).toBe(false);
  });
});

describe('normalizeTierApplicability', () => {
  it('collapses the array the admin UI sends into stored comma-separated text', () => {
    expect(normalizeTierApplicability(['TIER_1'])).toBe('TIER_1');
    expect(normalizeTierApplicability(['TIER_1', 'TIER_2'])).toBe('TIER_1,TIER_2');
  });

  it('drops unknown tiers rather than storing them', () => {
    expect(normalizeTierApplicability(['TIER_1', 'TIER_9'])).toBe('TIER_1');
  });

  it('falls back to ALL for empty or unusable input', () => {
    expect(normalizeTierApplicability([])).toBe('ALL');
    expect(normalizeTierApplicability(['NOPE'])).toBe('ALL');
    expect(normalizeTierApplicability('')).toBe('ALL');
    expect(normalizeTierApplicability(null)).toBe('ALL');
  });

  it('keeps an already-valid string', () => {
    expect(normalizeTierApplicability('ALL')).toBe('ALL');
    expect(normalizeTierApplicability('TIER_1,TIER_2')).toBe('TIER_1,TIER_2');
  });

  it('round-trips with launchCriterionApplies', () => {
    const stored = normalizeTierApplicability(['TIER_2']);
    expect(launchCriterionApplies(stored, 'TIER_2')).toBe(true);
    expect(launchCriterionApplies(stored, 'TIER_1')).toBe(false);
  });
});
