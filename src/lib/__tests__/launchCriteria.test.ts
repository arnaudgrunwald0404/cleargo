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
  effectiveDueDate,
  gateStatusFromItems,
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
    { artifact: 'Marketing Brief', TIER_1: 21, TIER_2: 14 },
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

describe('runwayDueOffsetDays with a fan-out', () => {
  // The naming gate now precedes both pricing and the Story Brief, so one row has
  // two successors. Before the fix this used `find`, so the due date depended on
  // whatever order the query returned.
  const nodes = [
    { id: 'name', tier_offset_days: { TIER_1: 105 }, default_due_offset_days: 105 },
    { id: 'pricing', depends_on_criterion_id: 'name', tier_offset_days: { TIER_1: 98 }, default_due_offset_days: 98 },
    { id: 'story', depends_on_criterion_id: 'name', tier_offset_days: { TIER_1: 91 }, default_due_offset_days: 91 },
  ];

  it('is due when the FIRST successor starts, not an arbitrary one', () => {
    expect(runwayDueOffsetDays(nodes[0], nodes, 'TIER_1')).toBe(98);
  });

  it('gives the same answer whatever order the rows arrive in', () => {
    const reversed = [nodes[0], nodes[2], nodes[1]];
    expect(runwayDueOffsetDays(nodes[0], reversed, 'TIER_1')).toBe(
      runwayDueOffsetDays(nodes[0], nodes, 'TIER_1')
    );
  });

  it('ignores a successor that does not apply to this tier', () => {
    const tiered = [
      nodes[0],
      { ...nodes[1], tier_applicability: 'TIER_2_ONLY' },
      nodes[2],
    ];
    // Pricing is filtered out, so the Story Brief becomes the first successor.
    expect(runwayDueOffsetDays(tiered[0], tiered, 'TIER_1')).toBe(91);
  });
});

describe('gateStatusFromItems', () => {
  const item = (status: string) => ({ status: status as never });

  it('clears the gate only when every applicable item is done', () => {
    expect(gateStatusFromItems([item('DONE'), item('DONE')])).toBe('DONE');
    expect(gateStatusFromItems([item('DONE'), item('NOT_STARTED')])).toBe('IN_PROGRESS');
  });

  it('is in progress as soon as one item moves', () => {
    expect(gateStatusFromItems([item('IN_PROGRESS'), item('NOT_STARTED')])).toBe('IN_PROGRESS');
  });

  it('is not started when nothing has moved', () => {
    expect(gateStatusFromItems([item('NOT_STARTED'), item('NOT_STARTED')])).toBe('NOT_STARTED');
  });

  it('ignores inapplicable items rather than counting them as done', () => {
    // Beta with no design partners: three items N/A, two still real.
    expect(gateStatusFromItems([item('NOT_APPLICABLE'), item('DONE')])).toBe('DONE');
    expect(gateStatusFromItems([item('NOT_APPLICABLE'), item('NOT_STARTED')])).toBe('NOT_STARTED');
  });

  it('reports the whole gate inapplicable only when every item is', () => {
    // A capability that runs no beta: "does not apply", never "complete".
    expect(gateStatusFromItems([item('NOT_APPLICABLE'), item('NOT_APPLICABLE')])).toBe('NOT_APPLICABLE');
  });

  it('returns null for a gate that has no items, so its own status stands', () => {
    expect(gateStatusFromItems([])).toBeNull();
  });
});

describe('scheduleState', () => {
  it('calls it compressed when the window closed before the launch existed', () => {
    // Kristin's 2026.8 case: release lands closer than the T1 runway needs. The
    // original 14-day window is re-granted from creation, so 08-15 is the date
    // that actually counts.
    expect(
      scheduleState({
        startDate: '2026-06-24',
        dueDate: '2026-07-08',
        today: '2026-08-14',
        launchCreatedAt: '2026-08-01T09:00:00Z',
      })
    ).toBe('compressed');
  });

  it('prefers compressed over late while the window allowed since creation is open', () => {
    const args = { startDate: '2026-06-24', dueDate: '2026-06-30', today: '2026-08-05' };
    // 6-day window, floored to 7 and re-granted from 08-01 -> 08-08.
    expect(scheduleState({ ...args, launchCreatedAt: '2026-08-01T09:00:00Z' })).toBe('compressed');
    // Same dates, but the launch existed in time — that really is late.
    expect(scheduleState({ ...args, launchCreatedAt: '2026-06-01T09:00:00Z' })).toBe('late');
  });

  it('stops excusing a compressed artifact once its re-granted window closes', () => {
    // The runway never fit, but 08-19 is well past the window allowed from
    // creation (08-08). Compression explains the impossible dates; it does not
    // mute the miss for the life of the launch.
    expect(
      scheduleState({
        startDate: '2026-06-24',
        dueDate: '2026-06-30',
        today: '2026-08-19',
        launchCreatedAt: '2026-08-01T09:00:00Z',
      })
    ).toBe('late');
  });

  it('never grants compression grace past GA', () => {
    // 60-day window re-granted from 08-01 would land after the launch. Nothing
    // is merely compressed once the thing has shipped.
    const args = {
      startDate: '2026-05-01',
      dueDate: '2026-06-30',
      launchCreatedAt: '2026-08-01T09:00:00Z',
      targetLaunchDate: '2026-08-25',
    };
    expect(scheduleState({ ...args, today: '2026-08-25' })).toBe('compressed');
    expect(scheduleState({ ...args, today: '2026-08-26' })).toBe('late');
    // Without a GA to clamp to, the full 60 days apply.
    expect(scheduleState({ ...args, targetLaunchDate: null, today: '2026-08-26' })).toBe('compressed');
  });

  it('floors the re-granted window so a chain-terminal artifact is not instantly late', () => {
    // No successor means due === start, a zero-length designed window. That must
    // not flip to overdue the day after the launch was created.
    const args = {
      startDate: '2026-08-06',
      dueDate: '2026-08-06',
      launchCreatedAt: '2026-08-18T09:00:00Z',
    };
    expect(scheduleState({ ...args, today: '2026-08-19' })).toBe('compressed');
    expect(scheduleState({ ...args, today: '2026-08-25' })).toBe('compressed');
    expect(scheduleState({ ...args, today: '2026-08-26' })).toBe('late');
  });

  it('leaves a dateless compressed artifact compressed — no due date, no miss', () => {
    expect(
      scheduleState({
        startDate: '2026-06-24',
        dueDate: null,
        today: '2026-12-01',
        launchCreatedAt: '2026-08-01T09:00:00Z',
      })
    ).toBe('compressed');
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

describe('effectiveDueDate', () => {
  it('passes the stored due date straight through when the runway fit', () => {
    expect(
      effectiveDueDate({
        startDate: '2026-09-01',
        dueDate: '2026-09-15',
        launchCreatedAt: '2026-08-01T09:00:00Z',
      })
    ).toBe('2026-09-15');
  });

  it('re-grants the designed window from launch creation when compressed', () => {
    // 14-day window, launch created 08-01 -> the date that counts is 08-15.
    expect(
      effectiveDueDate({
        startDate: '2026-06-24',
        dueDate: '2026-07-08',
        launchCreatedAt: '2026-08-01T09:00:00Z',
      })
    ).toBe('2026-08-15');
  });

  it('clamps the re-granted window to GA', () => {
    expect(
      effectiveDueDate({
        startDate: '2026-05-01',
        dueDate: '2026-06-30',
        launchCreatedAt: '2026-08-01T09:00:00Z',
        targetLaunchDate: '2026-08-25',
      })
    ).toBe('2026-08-25');
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
