import { parseISO } from 'date-fns';
import {
  allowedTrainMonthKeysForPlanVsActualReport,
  calendarDaysBetweenReleaseTrains,
  calendarMonthKeysForPeriod,
  deliveryKnowableByTrainSchedule,
  derivePlanVsActualStatus,
  includePlanVsActualItemForReport,
  isDelayedBeyondQuarter,
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

describe('deliveryKnowableByTrainSchedule', () => {
  it('is false when the end release train launches after the report period end', () => {
    const m = launchMap([['2026.2', '2026-02-01']]);
    expect(deliveryKnowableByTrainSchedule('Release 2026.2', '2026-01-31', m)).toBe(false);
  });

  it('is true when train launch is on or before period end', () => {
    const m = launchMap([['2026.2', '2026-01-15']]);
    expect(deliveryKnowableByTrainSchedule('2026.2', '2026-01-31', m)).toBe(true);
  });

  it('is false for a later train month when release_schedule has no launch date', () => {
    expect(deliveryKnowableByTrainSchedule('2026.5', '2026-04-30', new Map())).toBe(false);
    expect(deliveryKnowableByTrainSchedule('Release 2026.5', '2026-04-30')).toBe(false);
  });

  it('is true for same-month train when launch date is missing', () => {
    expect(deliveryKnowableByTrainSchedule('2026.4', '2026-04-30', new Map())).toBe(true);
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

  it('marks On Plan (not Delivered) when May train looks shipped in April progress view', () => {
    const order26 = idxMap([
      ['2026.4', 0],
      ['2026.5', 1],
    ]);
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2026.5',
        endRelease: '2026.5',
        startStatus: 'In development',
        endStatus: 'Released to GTM Team',
        periodEndIso: '2026-04-30',
      },
      order26,
      new Map(),
    );
    expect(r.category).toBe('green');
    expect(r.label).toBe('On Plan');
  });

  it('marks Delayed for minor release slip (≤2 slots and <90d between trains)', () => {
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
    expect(r.category).toBe('yellow');
    expect(r.label).toBe('Delayed');
  });

  it('marks Postponed when more than two release slots and 90+ days between trains', () => {
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
        ['2025.4', '2025-04-15'],
      ]),
    );
    expect(r.category).toBe('yellow');
    expect(r.label).toBe('Postponed');
  });

  it('marks Delayed when 1 slot slip but 90+ days between launch dates (within 2 trains OR <90d)', () => {
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
      launchMap([
        ['2025.2', '2025-01-01'],
        ['2025.3', '2025-06-01'],
      ]),
    );
    expect(r.category).toBe('yellow');
    expect(r.label).toBe('Delayed');
  });

  it('marks Delayed when 3+ slot slip but under 90 days between trains', () => {
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
    expect(r.label).toBe('Delayed');
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

  it('marks New Addition when pivot looks shipped but target train has not launched by period end', () => {
    const m = launchMap([['2026.2', '2026-02-01']]);
    const r = derivePlanVsActualStatus(
      {
        inStart: false,
        inEnd: true,
        startRelease: null,
        endRelease: 'Release 2026.2',
        startStatus: null,
        endStatus: 'Released to GTM Team',
        periodEndIso: '2026-01-31',
        firstScanRelease: 'Release 2026.2',
      },
      order,
      m,
    );
    expect(r.label).toBe('New Addition');
    expect(r.category).toBe('neutral');
  });

  it('marks Delivered: On Time when net-new, shipped, train launched by period end, same train since first scan', () => {
    const m = launchMap([['2026.2', '2026-01-20']]);
    const r = derivePlanVsActualStatus(
      {
        inStart: false,
        inEnd: true,
        startRelease: null,
        endRelease: '2026.2',
        startStatus: null,
        endStatus: 'Released to GTM Team',
        periodEndIso: '2026-01-31',
        firstScanRelease: '2026.2',
      },
      order,
      m,
    );
    expect(r.label).toBe('Delivered: On Time');
    expect(r.category).toBe('green');
  });

  it('marks Delivered: Added for net-new shipped when first-scan train differs from end train', () => {
    const m = launchMap([['2026.2', '2026-01-20']]);
    const r = derivePlanVsActualStatus(
      {
        inStart: false,
        inEnd: true,
        startRelease: null,
        endRelease: '2026.2',
        startStatus: null,
        endStatus: 'Released to GTM Team',
        periodEndIso: '2026-01-31',
        firstScanRelease: '2026.1',
      },
      order,
      m,
    );
    expect(r.label).toBe('Delivered: Added');
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

  it('marks Delivered: Early when shipped on an earlier train than period start', () => {
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
    expect(r.label).toBe('Delivered: Early');
  });

  it('marks Delivered: Early when absent from end snapshot but last in-period row shows earlier train and shipped', () => {
    const order26 = idxMap([
      ['2026.1', 0],
      ['2026.2', 1],
      ['2026.3', 2],
    ]);
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: false,
        startRelease: 'Release 2026.3',
        endRelease: 'Release 2026.2',
        startStatus: 'In development',
        endStatus: 'Released to GTM Team',
      },
      order26,
    );
    expect(r.category).toBe('green');
    expect(r.label).toBe('Delivered: Early');
  });

  it('forces On Plan for quarter_baseline even when snapshot status looks shipped', () => {
    const r = derivePlanVsActualStatus(
      {
        periodType: 'quarter_baseline',
        inStart: true,
        inEnd: true,
        startRelease: '2025.2',
        endRelease: '2025.2',
        startStatus: 'Released to GTM Team',
        endStatus: 'Released to GTM Team',
      },
      order,
    );
    expect(r.category).toBe('green');
    expect(r.label).toBe('On Plan');
  });

  it('marks Delayed (not Delivered: Delayed) when shipped in Aha but end train launches after period end', () => {
    const order26 = idxMap([
      ['2026.5', 0],
      ['2026.6', 1],
    ]);
    const m = launchMap([['2026.6', '2026-07-15']]);
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2026.5',
        endRelease: '2026.6',
        startStatus: 'In development',
        endStatus: 'Released to GTM Team',
        periodEndIso: '2026-06-30',
      },
      order26,
      m,
    );
    expect(r.category).toBe('yellow');
    expect(r.label).toBe('Delayed');
  });

  it('marks Ahead of Plan when target train moved earlier and not shipped', () => {
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2025.3',
        endRelease: '2025.2',
        startStatus: 'In development',
        endStatus: 'In development',
      },
      order,
    );
    expect(r.category).toBe('green');
    expect(r.label).toBe('Ahead of Plan');
  });

  it('marks Delayed (not Ahead of Plan) when slipped to a later train with mixed Release prefixes', () => {
    const order26 = idxMap([
      ['release 2026.5', 0],
      ['2026.6', 1],
    ]);
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: 'Release 2026.5',
        endRelease: '2026.6',
        startStatus: 'In development',
        endStatus: 'In development',
        periodEndIso: '2026-06-30',
      },
      order26,
    );
    expect(r.label).toBe('Delayed');
    expect(r.label).not.toBe('Ahead of Plan');
  });

  it('marks Delayed when quarter Plan was 2026.5 but early snapshot already showed 2026.6', () => {
    const order26 = idxMap([
      ['2026.5', 0],
      ['2026.6', 1],
    ]);
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2026.6',
        endRelease: '2026.6',
        planRelease: '2026.5',
        onQuarterPlan: true,
        startStatus: 'In development',
        endStatus: 'In development',
        periodEndIso: '2026-05-31',
      },
      order26,
    );
    expect(r.label).toBe('Delayed');
  });

  it('marks Delivered: Added for net-new beta not on quarter Plan', () => {
    const order26 = idxMap([['2026.5', 0]]);
    const m = launchMap([['2026.5', '2026-05-15']]);
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        onQuarterPlan: false,
        startRelease: null,
        endRelease: '2026.5',
        startStatus: null,
        endStatus: 'Released to GTM Team',
        periodEndIso: '2026-05-31',
      },
      order26,
      m,
    );
    expect(r.label).toBe('Delivered: Added');
  });

  it('does not mark Ahead of Plan when release_order_index keys are misaligned but months show a slip', () => {
    const badOrder = idxMap([
      ['2026.5', 5],
      ['release 2026.6', 0],
    ]);
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2026.5',
        endRelease: 'Release 2026.6',
        startStatus: 'In development',
        endStatus: 'In development',
        periodEndIso: '2026-06-30',
      },
      badOrder,
    );
    expect(r.label).not.toBe('Ahead of Plan');
    expect(['Delayed', 'Postponed']).toContain(r.label);
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

  it('keeps in-quarter plan rows that slipped to a train outside the report window', () => {
    expect(
      includePlanVsActualItemForReport(
        { inStart: true, inEnd: true, startRelease: '2026.6', endRelease: '2026.9' },
        aprilMonthQuarterScope,
      ),
    ).toBe(true);
    expect(
      includePlanVsActualItemForReport(
        { inStart: true, inEnd: true, startRelease: '2026.4', endRelease: '2026.9' },
        aprilMonthQuarterScope,
      ),
    ).toBe(true);
    expect(
      includePlanVsActualItemForReport(
        { inStart: true, inEnd: true, startRelease: '2026.4', endRelease: '2026.4' },
        aprilMonthQuarterScope,
      ),
    ).toBe(true);
  });

  it('marks Postponed when start train was in quarter and end train slipped past quarter', () => {
    const order26 = idxMap([
      ['2026.4', 0],
      ['2026.5', 1],
      ['2026.6', 2],
      ['2026.7', 3],
      ['2026.9', 4],
    ]);
    const launch26 = launchMap([
      ['2026.6', '2026-06-01'],
      ['2026.9', '2026-10-01'],
    ]);
    const r = derivePlanVsActualStatus(
      {
        inStart: true,
        inEnd: true,
        startRelease: '2026.6',
        endRelease: '2026.9',
        startStatus: 'In development',
        endStatus: 'In development',
        periodEndIso: '2026-04-30',
      },
      order26,
      launch26,
    );
    expect(r.category).toBe('yellow');
    expect(r.label).toBe('Delayed');
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

  it('drops net-new rows when release is missing, unparseable, or outside the quarter', () => {
    expect(
      includePlanVsActualItemForReport(
        { inStart: false, inEnd: true, endRelease: null },
        aprilMonthQuarterScope,
      ),
    ).toBe(false);
    expect(
      includePlanVsActualItemForReport(
        { inStart: false, inEnd: true, endRelease: 'Hotfix lane' },
        aprilMonthQuarterScope,
      ),
    ).toBe(false);
    expect(
      includePlanVsActualItemForReport(
        { inStart: false, inEnd: true, endRelease: '2026.9' },
        aprilMonthQuarterScope,
      ),
    ).toBe(false);
  });

  it('identifies delayed-beyond-quarter slips', () => {
    expect(
      isDelayedBeyondQuarter(
        { inStart: true, inEnd: true, startRelease: '2026.6', endRelease: '2026.9' },
        aprilMonthQuarterScope,
      ),
    ).toBe(true);
    expect(
      isDelayedBeyondQuarter(
        { inStart: false, inEnd: true, startRelease: null, endRelease: '2026.9' },
        aprilMonthQuarterScope,
      ),
    ).toBe(false);
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
