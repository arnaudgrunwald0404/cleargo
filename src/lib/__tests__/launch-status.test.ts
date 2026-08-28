import {
  computeLaunchStatus,
  effectiveLaunchStatus,
  isLaunchStatus,
  isLaunchStatusOverridden,
  isManualOnlyLaunchStatus,
  launchStatusView,
  launchWorkbackLeadDays,
  withLaunchStatus,
  LAUNCH_STATUSES,
  LAUNCH_WORKBACK_LEAD_DAYS,
  DEFAULT_LAUNCH_WORKBACK_LEAD_DAYS,
} from '../launch-status';

/** Fixed "today" so the suite never depends on the day it runs. */
const TODAY = new Date('2026-08-27T09:30:00');

function ymdOffsetFromToday(days: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

describe('computeLaunchStatus', () => {
  it('is Planning with no target date', () => {
    expect(computeLaunchStatus({ target_launch_date: null }, TODAY)).toBe('Planning');
    expect(computeLaunchStatus({}, TODAY)).toBe('Planning');
  });

  it('is Planning before the workback opens', () => {
    // TIER_1 opens at T-105, so T-106 is still planning.
    expect(
      computeLaunchStatus({ target_launch_date: ymdOffsetFromToday(106), tier: 'TIER_1' }, TODAY)
    ).toBe('Planning');
  });

  it('is In Progress on the day the workback opens', () => {
    expect(
      computeLaunchStatus({ target_launch_date: ymdOffsetFromToday(105), tier: 'TIER_1' }, TODAY)
    ).toBe('In Progress');
  });

  it('scales the Planning boundary by tier', () => {
    const target = ymdOffsetFromToday(90);
    // 90 days out is inside the 105-day TIER_1 runway but outside the 77-day TIER_2 one.
    expect(computeLaunchStatus({ target_launch_date: target, tier: 'TIER_1' }, TODAY)).toBe(
      'In Progress'
    );
    expect(computeLaunchStatus({ target_launch_date: target, tier: 'TIER_2' }, TODAY)).toBe(
      'Planning'
    );
  });

  it('is In Progress the day before launch', () => {
    expect(computeLaunchStatus({ target_launch_date: ymdOffsetFromToday(1) }, TODAY)).toBe(
      'In Progress'
    );
  });

  it('is Launched on the target date', () => {
    expect(computeLaunchStatus({ target_launch_date: ymdOffsetFromToday(0) }, TODAY)).toBe(
      'Launched'
    );
  });

  it('is Post-Launch the day after the target date', () => {
    expect(computeLaunchStatus({ target_launch_date: ymdOffsetFromToday(-1) }, TODAY)).toBe(
      'Post-Launch'
    );
    expect(computeLaunchStatus({ target_launch_date: ymdOffsetFromToday(-400) }, TODAY)).toBe(
      'Post-Launch'
    );
  });

  it('ignores the time of day on both sides', () => {
    const target = ymdOffsetFromToday(0);
    const lateEvening = new Date(TODAY);
    lateEvening.setHours(23, 59, 0, 0);
    expect(computeLaunchStatus({ target_launch_date: target }, lateEvening)).toBe('Launched');
  });

  it('treats an unparseable date as no date', () => {
    expect(computeLaunchStatus({ target_launch_date: 'not-a-date' }, TODAY)).toBe('Planning');
  });

  it('ignores any stored override', () => {
    expect(
      computeLaunchStatus(
        { status: 'Cancelled', target_launch_date: ymdOffsetFromToday(-1) },
        TODAY
      )
    ).toBe('Post-Launch');
  });
});

describe('effectiveLaunchStatus', () => {
  it('derives from dates when no override is stored', () => {
    expect(
      effectiveLaunchStatus({ status: null, target_launch_date: ymdOffsetFromToday(-1) }, TODAY)
    ).toBe('Post-Launch');
  });

  it('honours a manual-only override', () => {
    expect(
      effectiveLaunchStatus(
        { status: 'On Hold', target_launch_date: ymdOffsetFromToday(-1) },
        TODAY
      )
    ).toBe('On Hold');
    expect(
      effectiveLaunchStatus(
        { status: 'Cancelled', target_launch_date: ymdOffsetFromToday(10) },
        TODAY
      )
    ).toBe('Cancelled');
  });

  it('honours a pinned lifecycle status that contradicts the date', () => {
    // The point of always allowing overrides: a PMM can call a launch launched
    // ahead of its date, or hold it In Progress after the date has passed.
    expect(
      effectiveLaunchStatus(
        { status: 'Launched', target_launch_date: ymdOffsetFromToday(30) },
        TODAY
      )
    ).toBe('Launched');
    expect(
      effectiveLaunchStatus(
        { status: 'In Progress', target_launch_date: ymdOffsetFromToday(-30) },
        TODAY
      )
    ).toBe('In Progress');
  });

  it('falls back to the computation when the stored value is not a known status', () => {
    // Guards the pre-migration rows that held enum-style values (PLANNED etc.).
    expect(
      effectiveLaunchStatus(
        { status: 'PLANNED', target_launch_date: ymdOffsetFromToday(-1) },
        TODAY
      )
    ).toBe('Post-Launch');
  });
});

describe('launchStatusView / withLaunchStatus', () => {
  it('reports the override and what clearing it would restore', () => {
    expect(
      launchStatusView({ status: 'On Hold', target_launch_date: ymdOffsetFromToday(-1) }, TODAY)
    ).toEqual({
      status: 'On Hold',
      status_override: 'On Hold',
      computed_status: 'Post-Launch',
    });
  });

  it('reports no override when the launch is on autopilot', () => {
    expect(
      launchStatusView({ status: null, target_launch_date: ymdOffsetFromToday(0) }, TODAY)
    ).toEqual({
      status: 'Launched',
      status_override: null,
      computed_status: 'Launched',
    });
  });

  it('merges onto a row without dropping its other fields', () => {
    const row = {
      id: 'abc',
      name: 'Fall bundle',
      status: null,
      tier: 'TIER_2',
      target_launch_date: ymdOffsetFromToday(-2),
    };
    expect(withLaunchStatus(row, TODAY)).toEqual({
      ...row,
      status: 'Post-Launch',
      status_override: null,
      computed_status: 'Post-Launch',
    });
  });
});

describe('helpers', () => {
  it('recognises every status in the vocabulary and nothing else', () => {
    for (const status of LAUNCH_STATUSES) {
      expect(isLaunchStatus(status)).toBe(true);
    }
    expect(isLaunchStatus('PLANNED')).toBe(false);
    expect(isLaunchStatus(null)).toBe(false);
    expect(isLaunchStatus(undefined)).toBe(false);
    expect(isLaunchStatus('')).toBe(false);
  });

  it('separates the manual-only states from the computed ones', () => {
    expect(isManualOnlyLaunchStatus('On Hold')).toBe(true);
    expect(isManualOnlyLaunchStatus('Cancelled')).toBe(true);
    expect(isManualOnlyLaunchStatus('Planning')).toBe(false);
  });

  it('reports whether a launch is pinned', () => {
    expect(isLaunchStatusOverridden({ status: 'Cancelled' })).toBe(true);
    expect(isLaunchStatusOverridden({ status: null })).toBe(false);
    expect(isLaunchStatusOverridden({})).toBe(false);
  });

  it('falls back to the default runway for an unknown or missing tier', () => {
    expect(launchWorkbackLeadDays('TIER_1')).toBe(LAUNCH_WORKBACK_LEAD_DAYS.TIER_1);
    expect(launchWorkbackLeadDays('TIER_2')).toBe(LAUNCH_WORKBACK_LEAD_DAYS.TIER_2);
    expect(launchWorkbackLeadDays(null)).toBe(DEFAULT_LAUNCH_WORKBACK_LEAD_DAYS);
    expect(launchWorkbackLeadDays('TIER_3')).toBe(DEFAULT_LAUNCH_WORKBACK_LEAD_DAYS);
  });
});
