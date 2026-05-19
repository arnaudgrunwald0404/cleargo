import { allowedTrainMonthKeysForPlanVsActualReport } from '../planVsActualStatus';
import { supplementRpcRowsWithCleargoEpics } from '../planVsActualLiveEpic';
import type { RpcPlanVsActualRow } from '@/lib/services/planVsActualService';

describe('supplementRpcRowsWithCleargoEpics', () => {
  const aprilScope = {
    allowedTrainMonthKeys: allowedTrainMonthKeysForPlanVsActualReport(
      'quarter_progress',
      '2026-04-01',
      '2026-04-30',
    ),
  };

  it('adds cleargo candidate epics not on snapshot as net-new rows', () => {
    const rows: RpcPlanVsActualRow[] = [];
    const out = supplementRpcRowsWithCleargoEpics(
      rows,
      [
        {
          aha_id: 'APP-E-999',
          name: 'AI Sourcing Max (Beta Launch)',
          aha_fields: {
            custom_fields: { cleargo_candidate: 'Yes' },
            standard_fields: {
              aha_release_name: 'Release 2026.5',
              workflow_status: 'In development',
            },
          },
        },
      ],
      'quarter_progress',
      aprilScope,
      '2026-04-30',
    );
    expect(out).toHaveLength(1);
    expect(out[0].aha_key).toBe('APP-E-999');
    expect(out[0].in_start).toBe(false);
    expect(out[0].in_end).toBe(true);
    expect(out[0].end_aha_release).toBe('Release 2026.5');
  });

  it('does not add cleargo epics targeting a train outside the quarter', () => {
    const out = supplementRpcRowsWithCleargoEpics(
      [],
      [
        {
          aha_id: 'APP-E-387',
          name: 'Employee eSign Documents - MLP',
          aha_fields: {
            custom_fields: { cleargo_candidate: 'Yes' },
            standard_fields: {
              aha_release_name: 'Release 2026.9',
              workflow_status: 'In development',
            },
          },
        },
      ],
      'quarter_progress',
      aprilScope,
      '2026-04-30',
    );
    expect(out).toHaveLength(0);
  });

  it('skips supplement for quarter baseline (plan-only snapshots)', () => {
    const out = supplementRpcRowsWithCleargoEpics(
      [],
      [
        {
          aha_id: 'APP-E-999',
          name: 'Beta',
          aha_fields: {
            custom_fields: { cleargo_candidate: 'Yes' },
            standard_fields: { aha_release_name: 'Release 2026.5' },
          },
        },
      ],
      'quarter_baseline',
      aprilScope,
      '2026-04-01',
    );
    expect(out).toHaveLength(0);
  });
});
