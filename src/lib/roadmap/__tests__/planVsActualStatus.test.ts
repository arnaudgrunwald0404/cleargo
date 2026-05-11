import { parseISO } from 'date-fns';
import {
  allowedTrainMonthKeysForPlanVsActualReport,
  calendarDaysBetweenReleaseTrains,
  calendarMonthKeysForPeriod,
  derivePlanVsActualStatus,
  includePlanVsActualItemForReport,
  looksDeliveredStatus,
} from '../planVsActualStatus';

function idxMap(entries: [string, number][]) {
  return new Map(entries.map(([k, v]) => [k.toLowerCase(), v]));
}

/** Lowercased release key → launch date for day-gap tests */
function launchMap(entries: [string, string][]) {
  const m = new Map<string, Date>();
  for (const [k, iso] of entries) {
    m.set(k.toLowerCase(), parseISO(iso));
  }
  return m;
}

describe('looksDeliveredStatus', () => {
  it('detects shipped wording', () => {
    expect(looksDeliveredStatus('Shipped')).toBe(true);
    expect(looksDeliveredStatus('Released to GA')).toBe(true);
  });

  it('detects canonical Aha workflow names', () => {
    expect(looksDeliveredStatus('Feature Complete')).toBe(true);
    expect(looksDeliveredStatus('Released to GTM Team')).toBe(true);
    expect(looksDeliveredStatus('Released to Internal Orgs')).toBe(true);
    expect(looksDeliveredStatus('Released to Cohort 1')).toBe(true);
    expect(looksDeliveredStatus('Complete/Done (GA)')).toBe(true);
  });
});

describe('calendarDaysBetweenReleaseTrains', () => {
  it('returns positive days when end train is later', () => {
    const m = launchMap([
      ['2025.1', '2025-01-01'],
      ['2025.4', '2025-10-01'],
    ]);
    expect(calendarDaysBetweenReleaseTrains('2025.1', '2025.4', m)).toBe(273);
  });
});

describe('derivePlanVsActualStatus', () => {
  const order = idxMap([
    ['2025.1', 0],
    ['2025.2', 1],
    ['2025.3', 2],
    ['2025.4', 3],
  ]);

  const launch = launchMap([
    ['2025.1', '2025-01-01'],
    ['2025.2', '2025-02-01'],
    ['2025.3', '2025-03-01'],
    ['2025.4', '2025-10-01'],
  ]);

  it('marks Removed when dropped from end snapshot and not delivered', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: false,
        startRelease: '2025.2',
        endRelease: null,
        startStatus: 'In development',
        endStatus: null,
      },
      order,
    );
    expect(r.category).toBe('red');
    expect(r.label).toBe('Removed');
  });

  it('marks Removed when absent from end snapshot and start status does not look delivered', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: false,
        startRelease: '2026.2',
        endRelease: null,
        startStatus: 'In development',
        endStatus: null,
      },
      order,
    );
    expect(r.category).toBe('red');
    expect(r.label).toBe('Removed');
  });

  it('marks Delivered: On Time when absent from end snapshot but start snapshot status looks shipped (pivot dropped row)', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: false,
        startRelease: 'Release 2026.2',
        endRelease: null,
        startStatus: 'Released to GTM Team',
        endStatus: null,
      },
      order,
    );
    expect(r.category).toBe('green');
    expect(r.label).toBe('Delivered: On Time');
  });

  it('marks Delivered: On Time when absent from last pivot week but latest in-period row has 100% progress', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: false,
        startRelease: 'Release 2026.1',
        endRelease: 'Release 2026.1',
        startStatus: 'Not Started',
        endStatus: 'Pod Planning / Story Mapping',
        endProgress: 100,
      },
      order,
    );
    expect(r.category).toBe('green');
    expect(r.label).toBe('Delivered: On Time');
  });

  it('marks On Plan when same release and not delivered', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2025.2',
        endRelease: '2025.2',
        startStatus: 'In development',
        endStatus: 'In development',
      },
      order,
    );
    expect(r.category).toBe('green');
    expect(r.label).toBe('On Plan');
  });

  it('marks On Plan for minor release slip (≤2 slots and <90d between trains)', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2025.2',
        endRelease: '2025.3',
        startStatus: 'In development',
        endStatus: 'In development',
      },
      order,
      launch,
    );
    expect(r.category).toBe('green');
    expect(r.label).toBe('On Plan');
  });

  it('marks Postponed when more than two release slots while still in flight', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2025.1',
        endRelease: '2025.4',
        startStatus: 'In development',
        endStatus: 'In development',
      },
      order,
      launchMap([
        ['2025.1', '2025-01-01'],
        ['2025.4', '2025-03-15'],
      ]),
    );
    expect(r.category).toBe('yellow');
    expect(r.label).toBe('Postponed');
  });

  it('marks Removed when unreleased slip is 200+ days on the schedule', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2025.1',
        endRelease: '2025.4',
        startStatus: 'In development',
        endStatus: 'In development',
      },
      order,
      launch,
    );
    expect(r.category).toBe('red');
    expect(r.label).toBe('Removed');
  });

  it('marks New Addition when epic appears only at end and not delivered', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: false,
        inEnd: true,
        startRelease: null,
        endRelease: '2026.4',
        startStatus: null,
        endStatus: 'In development',
      },
      order,
    );
    expect(r.label).toBe('New Addition');
    expect(r.category).toBe('neutral');
  });

  it('marks Delivered: Added for net-new epics that shipped in the period', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: false,
        inEnd: true,
        startRelease: null,
        endRelease: '2026.4',
        startStatus: null,
        endStatus: 'Released to GTM Team',
      },
      order,
    );
    expect(r.category).toBe('green');
    expect(r.label).toBe('Delivered: Added');
  });

  it('marks Delivered: Delayed when shipped on a later train', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2025.2',
        endRelease: '2025.3',
        startStatus: 'In development',
        endStatus: 'Released to GTM Team',
      },
      order,
    );
    expect(r.category).toBe('yellow');
    expect(r.label).toBe('Delivered: Delayed');
  });

  it('marks Delivered: On Time when shipped on an earlier train', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2025.3',
        endRelease: '2025.2',
        startStatus: 'In development',
        endStatus: 'Released to GTM Team',
      },
      order,
    );
    expect(r.category).toBe('green');
    expect(r.label).toBe('Delivered: On Time');
  });
});

describe('allowedTrainMonthKeysForPlanVsActualReport', () => {
  it('uses the full calendar quarter for quarter_progress periods', () => {
    const keys = allowedTrainMonthKeysForPlanVsActualReport('quarter_progress', '2026-04-01', '2026-04-30');
    expect([...keys].sort((a, b) => a - b)).toEqual([202604, 202605, 202606]);
  });

  it('matches quarterly bounds for quarterly periods', () => {
    const fromHelper = allowedTrainMonthKeysForPlanVsActualReport('quarterly', '2026-04-01', '2026-06-30');
    const direct = calendarMonthKeysForPeriod('2026-04-01', '2026-06-30');
    expect(fromHelper).toEqual(direct);
  });
});

describe('includePlanVsActualItemForReport', () => {
  /** In-quarter progress (e.g. April): release trains for Apr–Jun (same quarter), not Jul onward. */
  const aprilMonthQuarterScope = {
    allowedTrainMonthKeys: allowedTrainMonthKeysForPlanVsActualReport(
      'quarter_progress',
      '2026-04-01',
      '2026-04-30',
    ),
  };

  it('drops net-new rows targeting a train outside the report window', () => {
    expect(
      includePlanVsActualItemForReport(
        { inStart: false, inEnd: true, endRelease: '2026.9' },
        aprilMonthQuarterScope,
      ),
    ).toBe(false);
    expect(
      includePlanVsActualItemForReport(
        { inStart: false, inEnd: true, endRelease: '2026.7' },
        aprilMonthQuarterScope,
      ),
    ).toBe(false);
    expect(
      includePlanVsActualItemForReport(
        { inStart: false, inEnd: true, endRelease: 'Release 2026.9' },
        aprilMonthQuarterScope,
      ),
    ).toBe(false);
  });

  it('keeps net-new rows targeting a train inside the quarter (including May while viewing April)', () => {
    expect(
      includePlanVsActualItemForReport(
        { inStart: false, inEnd: true, endRelease: '2026.4' },
        aprilMonthQuarterScope,
      ),
    ).toBe(true);
    expect(
      includePlanVsActualItemForReport(
        { inStart: false, inEnd: true, endRelease: '2026.5' },
        aprilMonthQuarterScope,
      ),
    ).toBe(true);
    expect(
      includePlanVsActualItemForReport(
        { inStart: false, inEnd: true, endRelease: '2026.6' },
        aprilMonthQuarterScope,
      ),
    ).toBe(true);
  });

  it('drops steady-state / slips when end train is outside the report window', () => {
    expect(
      includePlanVsActualItemForReport(
        { inStart: true, inEnd: true, startRelease: '2026.4', endRelease: '2026.9' },
        aprilMonthQuarterScope,
      ),
    ).toBe(false);
    expect(
      includePlanVsActualItemForReport(
        { inStart: true, inEnd: true, startRelease: '2026.4', endRelease: '2026.4' },
        aprilMonthQuarterScope,
      ),
    ).toBe(true);
  });

  it('drops removed rows when start train is outside the report window', () => {
    expect(
      includePlanVsActualItemForReport(
        { inStart: true, inEnd: false, startRelease: '2026.9', endRelease: null },
        aprilMonthQuarterScope,
      ),
    ).toBe(false);
    expect(
      includePlanVsActualItemForReport(
        { inStart: true, inEnd: false, startRelease: '2026.4', endRelease: null },
        aprilMonthQuarterScope,
      ),
    ).toBe(true);
  });

  it('keeps net-new rows when release is missing or not YYYY.MM', () => {
    expect(
      includePlanVsActualItemForReport(
        { inStart: false, inEnd: true, endRelease: null },
        aprilMonthQuarterScope,
      ),
    ).toBe(true);
    expect(
      includePlanVsActualItemForReport(
        { inStart: false, inEnd: true, endRelease: 'Hotfix lane' },
        aprilMonthQuarterScope,
      ),
    ).toBe(true);
  });

  it('quarterly window keeps adds for any of the three monthly trains', () => {
    const q2 = {
      allowedTrainMonthKeys: allowedTrainMonthKeysForPlanVsActualReport(
        'quarterly',
        '2026-04-01',
        '2026-06-30',
      ),
    };
    expect(includePlanVsActualItemForReport({ inStart: false, inEnd: true, endRelease: '2026.6' }, q2)).toBe(
      true,
    );
    expect(includePlanVsActualItemForReport({ inStart: false, inEnd: true, endRelease: '2026.7' }, q2)).toBe(
      false,
    );
  });
});
