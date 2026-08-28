import {
  calculateLaunchReadiness,
  computeLaunchReadiness,
  isGating,
  type LaunchReadinessItem,
} from '../launch-readiness';

const GA = '2026-09-17';
const TODAY = '2026-08-19';
// Created long before anything was due, so overdue items read as late rather
// than compressed.
const OLD_LAUNCH = '2026-06-01T09:00:00Z';

function item(over: Partial<LaunchReadinessItem> & { id: string }): LaunchReadinessItem {
  return {
    label: over.id,
    status: 'NOT_STARTED',
    due_date: null,
    gate: false,
    ...over,
  } as LaunchReadinessItem;
}

describe('isGating', () => {
  it('accepts both the boolean column and the legacy "hard" string', () => {
    // The column is boolean, but the admin UI still round-trips 'hard'/'soft',
    // and the launch page used a strict === "hard" check that silently treated
    // every real gate as non-gating.
    expect(isGating(true)).toBe(true);
    expect(isGating('hard')).toBe(true);
    expect(isGating(false)).toBe(false);
    expect(isGating('soft')).toBe(false);
    expect(isGating(null)).toBe(false);
    expect(isGating(undefined)).toBe(false);
  });
});

describe('calculateLaunchReadiness', () => {
  it('is a plain unweighted percentage', () => {
    expect(calculateLaunchReadiness([{ status: 'DONE' }, { status: 'NOT_STARTED' }])).toBe(50);
    expect(calculateLaunchReadiness([])).toBe(0);
  });
});

describe('computeLaunchReadiness', () => {
  const base = { targetLaunchDate: GA, tier: 'TIER_2', launchCreatedAt: OLD_LAUNCH, today: TODAY };

  it('is NOT_EVALUATED with no items', () => {
    const r = computeLaunchReadiness({ ...base, items: [] });
    expect(r.verdict).toBe('NOT_EVALUATED');
    expect(r.readinessPct).toBe(0);
  });

  it('is NOT_EVALUATED without a launch date, but still reports completion', () => {
    const r = computeLaunchReadiness({
      ...base,
      targetLaunchDate: null,
      items: [item({ id: 'a', status: 'DONE' }), item({ id: 'b' })],
    });
    expect(r.verdict).toBe('NOT_EVALUATED');
    expect(r.readinessPct).toBe(50);
  });

  it('blocks on a gate whose window has passed', () => {
    const r = computeLaunchReadiness({
      ...base,
      items: [
        item({ id: 'gate', gate: true, due_date: '2026-08-06', tier_offset_days: { TIER_2: 42 } }),
        item({ id: 'other', due_date: '2026-09-10', tier_offset_days: { TIER_2: 14 } }),
      ],
    });
    expect(r.verdict).toBe('NO_GO_BLOCKED_BY_GATING');
    expect(r.blockers.map((b) => b.id)).toEqual(['gate']);
  });

  it('treats a compressed gate as at risk, not blocked', () => {
    // The runway never fit, so the team cannot have missed the window — calling
    // that NO_GO would blame them for arithmetic.
    const r = computeLaunchReadiness({
      ...base,
      launchCreatedAt: '2026-08-18T09:00:00Z',
      items: [
        item({ id: 'gate', gate: true, due_date: '2026-08-06', tier_offset_days: { TIER_2: 42 } }),
      ],
    });
    expect(r.verdict).toBe('AT_RISK');
    expect(r.blockers).toHaveLength(0);
    expect(r.atRisk.map((a) => a.id)).toEqual(['gate']);
  });

  it('leaves an inapplicable gate out of the count entirely', () => {
    // Beta on a capability that runs no beta. Not a blocker, not at risk, and not
    // credited as done either -- it should not flatter the score.
    const r = computeLaunchReadiness({
      ...base,
      items: [
        item({ id: 'beta', gate: true, status: 'NOT_APPLICABLE', due_date: '2026-08-06', tier_offset_days: { TIER_2: 42 } }),
        item({ id: 'real', gate: true, status: 'DONE', due_date: '2026-08-27', tier_offset_days: { TIER_2: 35 } }),
      ],
    });
    expect(r.gatesTotal).toBe(1);
    expect(r.gatesDone).toBe(1);
    expect(r.itemsTotal).toBe(1);
    expect(r.blockers).toHaveLength(0);
    expect(r.atRisk).toHaveLength(0);
    expect(r.readinessPct).toBe(100);
  });

  it('does not let an inapplicable row raise the score', () => {
    // One real gate outstanding. N/A must not read as progress.
    const r = computeLaunchReadiness({
      ...base,
      items: [
        item({ id: 'beta', gate: true, status: 'NOT_APPLICABLE', tier_offset_days: { TIER_2: 42 } }),
        item({ id: 'real', gate: true, status: 'NOT_STARTED', due_date: '2026-08-27', tier_offset_days: { TIER_2: 35 } }),
      ],
    });
    expect(r.readinessPct).toBe(0);
    expect(r.gatesTotal).toBe(1);
  });

  it('is NOT_EVALUATED when every row is inapplicable', () => {
    const r = computeLaunchReadiness({
      ...base,
      items: [item({ id: 'beta', gate: true, status: 'NOT_APPLICABLE' })],
    });
    expect(r.verdict).toBe('NOT_EVALUATED');
    expect(r.itemsTotal).toBe(0);
  });

  it('is AT_RISK for a gate currently inside its window', () => {
    const r = computeLaunchReadiness({
      ...base,
      items: [
        item({ id: 'gate', gate: true, due_date: '2026-08-27', tier_offset_days: { TIER_2: 35 } }),
      ],
    });
    expect(r.verdict).toBe('AT_RISK');
    expect(r.atRisk.map((a) => a.id)).toEqual(['gate']);
  });

  it('is CONDITIONAL_GO when only non-gate work has slipped', () => {
    const r = computeLaunchReadiness({
      ...base,
      items: [
        item({ id: 'gate', gate: true, status: 'DONE', due_date: '2026-08-06', tier_offset_days: { TIER_2: 42 } }),
        item({ id: 'task', due_date: '2026-08-13', tier_offset_days: { TIER_2: 35 } }),
      ],
    });
    expect(r.verdict).toBe('CONDITIONAL_GO');
    expect(r.blockers).toHaveLength(0);
  });

  it('is GO when gates are clear and nothing has slipped', () => {
    const r = computeLaunchReadiness({
      ...base,
      items: [
        item({ id: 'gate', gate: true, status: 'DONE', due_date: '2026-08-06', tier_offset_days: { TIER_2: 42 } }),
        // Still ahead of us — not started is fine.
        item({ id: 'later', due_date: '2026-09-10', tier_offset_days: { TIER_2: 14 } }),
      ],
    });
    expect(r.verdict).toBe('GO');
  });

  it('does not treat an upcoming gate as a risk', () => {
    // A launch three months out with nothing due yet is on track, not at risk.
    const r = computeLaunchReadiness({
      ...base,
      targetLaunchDate: '2026-12-03',
      items: [
        item({ id: 'gate', gate: true, due_date: '2026-10-29', tier_offset_days: { TIER_2: 42 } }),
      ],
    });
    expect(r.verdict).toBe('GO');
    expect(r.atRisk).toHaveLength(0);
  });

  it('weights gates above ordinary items', () => {
    const gateDone = computeLaunchReadiness({
      ...base,
      items: [
        item({ id: 'g', gate: true, status: 'DONE' }),
        item({ id: 'a' }),
        item({ id: 'b' }),
        item({ id: 'c' }),
      ],
    });
    const tasksDone = computeLaunchReadiness({
      ...base,
      items: [
        item({ id: 'g', gate: true }),
        item({ id: 'a', status: 'DONE' }),
        item({ id: 'b', status: 'DONE' }),
        item({ id: 'c', status: 'DONE' }),
      ],
    });
    // Both complete 1 of 4 rows by count, but the gate carries 3x the weight.
    expect(gateDone.readinessPct).toBe(50); // 3 of 6
    expect(tasksDone.readinessPct).toBe(50); // 3 of 6
    // ...and a gate alone outweighs a single ordinary item.
    const one = computeLaunchReadiness({
      ...base,
      items: [item({ id: 'g', gate: true, status: 'DONE' }), item({ id: 'a' })],
    });
    expect(one.readinessPct).toBe(75); // 3 of 4
  });

  it('gives partial credit for in-progress work', () => {
    const r = computeLaunchReadiness({
      ...base,
      items: [item({ id: 'a', status: 'IN_PROGRESS' }), item({ id: 'b' })],
    });
    expect(r.readinessPct).toBe(25);
  });

  it('reports gate and item tallies for the UI', () => {
    const r = computeLaunchReadiness({
      ...base,
      items: [
        item({ id: 'g1', gate: true, status: 'DONE' }),
        item({ id: 'g2', gate: 'hard' }),
        item({ id: 'a', status: 'DONE' }),
      ],
    });
    expect(r.gatesTotal).toBe(2);
    expect(r.gatesDone).toBe(1);
    expect(r.itemsTotal).toBe(3);
    expect(r.itemsDone).toBe(2);
  });
});
