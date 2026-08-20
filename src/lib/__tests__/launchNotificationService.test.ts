import {
  planLaunchNotifications,
  describeAction,
  type NotifyLaunch,
  type NotifyCriterion,
  type PriorNotification,
} from '../services/launchNotificationService';

const GA = '2026-09-17';
const TODAY = '2026-08-20';
/** Created long before anything was due, so overdue reads as late not compressed. */
const OLD = '2026-06-01T09:00:00Z';

function crit(over: Partial<NotifyCriterion> & { criterion_id: string }): NotifyCriterion {
  return {
    label: over.criterion_id,
    status: 'NOT_STARTED',
    owner_email: 'owner@clearcompany.com',
    due_date: null,
    gate: false,
    ...over,
  } as NotifyCriterion;
}

function launch(items: NotifyCriterion[], over: Partial<NotifyLaunch> = {}): NotifyLaunch {
  return {
    id: 'L1',
    name: 'Agent Platform',
    tier: 'TIER_2',
    target_launch_date: GA,
    owner_email: 'pmm@clearcompany.com',
    created_at: OLD,
    items,
    ...over,
  };
}

const plan = (l: NotifyLaunch, priors: PriorNotification[] = []) =>
  planLaunchNotifications({ launches: [l], priors, today: TODAY });

describe('planLaunchNotifications', () => {
  it('says nothing about an artifact still in the future', () => {
    const items = [crit({ criterion_id: 'a', due_date: '2026-09-10', tier_offset_days: { TIER_2: 14 } })];
    expect(plan(launch(items))).toHaveLength(0);
  });

  it('says nothing about a completed artifact', () => {
    const items = [
      crit({ criterion_id: 'a', status: 'DONE', due_date: '2026-08-13', tier_offset_days: { TIER_2: 35 } }),
    ];
    expect(plan(launch(items))).toHaveLength(0);
  });

  it('opens the window when the artifact becomes actionable', () => {
    // starts Aug 13 (GA-35), due Aug 27 — today Aug 20 is inside that window.
    const items = [crit({ criterion_id: 'a', due_date: '2026-08-27', tier_offset_days: { TIER_2: 35 } })];
    const actions = plan(launch(items));
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe('window_open');
    expect(actions[0].recipientEmail).toBe('owner@clearcompany.com');
  });

  it('reports overdue when the window has closed', () => {
    const items = [crit({ criterion_id: 'a', due_date: '2026-08-13', tier_offset_days: { TIER_2: 42 } })];
    const actions = plan(launch(items));
    expect(actions[0].kind).toBe('overdue');
  });

  it('never reports a compressed artifact as overdue', () => {
    // Kristin's rule: the release landed closer than the runway needs, so the
    // window never existed and nobody missed it.
    const items = [crit({ criterion_id: 'a', due_date: '2026-08-13', tier_offset_days: { TIER_2: 42 } })];
    const actions = plan(launch(items, { created_at: '2026-08-19T09:00:00Z' }));
    expect(actions[0].kind).toBe('window_open');
  });

  it('escalates a gate that is blocking, and names what it holds up', () => {
    const items = [
      crit({ criterion_id: 'gate', label: 'Pricing cleared', gate: true, due_date: '2026-08-13', tier_offset_days: { TIER_2: 42 } }),
      crit({ criterion_id: 'story', label: 'Story Brief', depends_on_criterion_id: 'gate', due_date: '2026-08-27', tier_offset_days: { TIER_2: 35 } }),
    ];
    const actions = plan(launch(items));
    const gate = actions.find((a) => a.criterionId === 'gate')!;
    expect(gate.kind).toBe('gate_blocking');
    expect(gate.blocking).toEqual(['Story Brief']);
    expect(gate.escalateTo).toEqual(['pmm@clearcompany.com']);
  });

  it('treats an overdue gate blocking nothing as an ordinary overdue', () => {
    const items = [
      crit({ criterion_id: 'gate', gate: true, due_date: '2026-08-13', tier_offset_days: { TIER_2: 42 } }),
    ];
    expect(plan(launch(items))[0].kind).toBe('overdue');
    expect(plan(launch(items))[0].escalateTo).toEqual([]);
  });

  it('does not count a completed successor as blocked', () => {
    const items = [
      crit({ criterion_id: 'gate', gate: true, due_date: '2026-08-13', tier_offset_days: { TIER_2: 42 } }),
      crit({ criterion_id: 'story', status: 'DONE', depends_on_criterion_id: 'gate', due_date: '2026-08-27' }),
    ];
    expect(plan(launch(items))[0].kind).toBe('overdue');
  });

  it('says unblocked rather than window_open while a predecessor is outstanding', () => {
    const items = [
      crit({ criterion_id: 'gate', gate: true, due_date: '2026-08-06', tier_offset_days: { TIER_2: 42 } }),
      crit({ criterion_id: 'story', depends_on_criterion_id: 'gate', due_date: '2026-08-27', tier_offset_days: { TIER_2: 35 } }),
    ];
    const story = plan(launch(items)).find((a) => a.criterionId === 'story')!;
    expect(story.kind).toBe('unblocked');
  });

  it('says each thing once — a second pass is silent', () => {
    const items = [crit({ criterion_id: 'a', due_date: '2026-08-27', tier_offset_days: { TIER_2: 35 } })];
    const first = plan(launch(items));
    expect(first).toHaveLength(1);
    const priors: PriorNotification[] = [
      { launch_id: 'L1', criterion_id: 'a', kind: 'window_open', slack_ts: '111.222', slack_channel: 'D1' },
    ];
    expect(plan(launch(items), priors)).toHaveLength(0);
  });

  it('edits the existing message when an artifact later goes overdue', () => {
    // The DM stays one message per artifact instead of a growing pile.
    const items = [crit({ criterion_id: 'a', due_date: '2026-08-13', tier_offset_days: { TIER_2: 42 } })];
    const priors: PriorNotification[] = [
      { launch_id: 'L1', criterion_id: 'a', kind: 'window_open', slack_ts: '111.222', slack_channel: 'D1' },
    ];
    const actions = plan(launch(items), priors);
    expect(actions[0].kind).toBe('overdue');
    expect(actions[0].editExisting).toEqual({ slack_ts: '111.222', slack_channel: 'D1' });
  });

  it('falls back to the launch owner for an unassigned artifact', () => {
    const items = [
      crit({ criterion_id: 'a', owner_email: null, due_date: '2026-08-27', tier_offset_days: { TIER_2: 35 } }),
    ];
    expect(plan(launch(items))[0].recipientEmail).toBe('pmm@clearcompany.com');
  });

  it('stays silent when there is nobody to tell', () => {
    const items = [
      crit({ criterion_id: 'a', owner_email: null, due_date: '2026-08-27', tier_offset_days: { TIER_2: 35 } }),
    ];
    expect(plan(launch(items, { owner_email: null }))).toHaveLength(0);
  });

  it('ignores a launch with no target date', () => {
    const items = [crit({ criterion_id: 'a', due_date: '2026-08-27' })];
    expect(plan(launch(items, { target_launch_date: null }))).toHaveLength(0);
  });

  it('uses the tier-appropriate window', () => {
    // The same artifact is in-window for T2 (starts GA-35 = Aug 13) but still
    // upcoming for T1 (starts GA-56 = Jul 23, due GA-42 = Aug 6 — already past).
    const items = [
      crit({ criterion_id: 'a', due_date: '2026-08-27', tier_offset_days: { TIER_1: 56, TIER_2: 35 } }),
    ];
    expect(plan(launch(items, { tier: 'TIER_2' }))[0].kind).toBe('window_open');
    expect(plan(launch(items, { tier: 'TIER_1' }))[0].kind).toBe('window_open');
  });
});

describe('describeAction', () => {
  const base = {
    launchId: 'L1',
    launchName: 'Agent Platform',
    criterionId: 'c',
    label: 'Message Brief',
    recipientEmail: 'a@b.com',
    startDate: '2026-08-13',
    dueDate: '2026-08-27',
    escalateTo: [],
    editExisting: null,
  };

  it('names what a blocking gate holds up', () => {
    const d = describeAction({ ...base, kind: 'gate_blocking', blocking: ['Story Brief', 'Enablement'] });
    expect(d.text).toContain('blocking Agent Platform');
    expect(d.detail).toContain('Story Brief, Enablement');
  });

  it('mentions downstream impact on an overdue artifact only when there is any', () => {
    expect(describeAction({ ...base, kind: 'overdue', blocking: [] }).detail).not.toContain('Holding up');
    expect(describeAction({ ...base, kind: 'overdue', blocking: ['X'] }).detail).toContain('Holding up: X');
  });

  it('covers every kind', () => {
    for (const kind of ['window_open', 'unblocked', 'overdue', 'gate_blocking'] as const) {
      const d = describeAction({ ...base, kind, blocking: ['X'] });
      expect(d.text.length).toBeGreaterThan(0);
      expect(d.detail.length).toBeGreaterThan(0);
    }
  });
});
