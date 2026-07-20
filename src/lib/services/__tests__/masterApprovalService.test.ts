/**
 * Tests for maybeNotifyMasterApproversWhenGatesComplete (CLEARGO-I-9).
 * The master approver is notified only once EVERY department gate is decided.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockSendSlack = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSendEmail = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCanReceiveSlack = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockSyncHandle = jest.fn<() => Promise<string | null>>().mockResolvedValue(null);
const mockGetSettings = jest.fn<() => Promise<any>>().mockResolvedValue({});

jest.mock('@/lib/slack/notifications', () => ({
  sendSlackNotification: mockSendSlack,
  canReceiveSlackNotification: mockCanReceiveSlack,
  syncUserSlackHandle: mockSyncHandle,
}));
jest.mock('@/lib/email/notifications', () => ({ sendEmailNotification: mockSendEmail }));
jest.mock('@/lib/settings-db', () => ({ getSettings: mockGetSettings }));

// Admin client only used for the 24h dedup lookup — return "no recent log".
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => {
      const chain: any = { maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) };
      for (const m of ['select', 'eq', 'gte', 'limit', 'filter']) chain[m] = jest.fn().mockReturnValue(chain);
      return chain;
    },
  }),
}));

function buildMockSupabase(calls: Array<{ data: any; error: any }>) {
  let i = 0;
  return {
    from: jest.fn().mockImplementation(() => {
      const result = calls[i] ?? { data: null, error: null };
      i++;
      const chain: any = {
        then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
        single: jest.fn().mockResolvedValue(result),
        maybeSingle: jest.fn().mockResolvedValue(result),
      };
      for (const m of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'filter']) {
        chain[m] = jest.fn().mockReturnValue(chain);
      }
      return chain;
    }),
  };
}

const GATE_ROW = (status: string, id: string) => ({
  id,
  status,
  criterion: { gate: true, is_active: true },
});

const APPROVER = {
  id: 'approver-1',
  email: 'cpo@example.com',
  first_name: 'Casey',
  last_name: 'Po',
  slack_handle: 'UCPO111',
  notification_preferences: {},
};

describe('maybeNotifyMasterApproversWhenGatesComplete', () => {
  let fn: typeof import('../masterApprovalService').maybeNotifyMasterApproversWhenGatesComplete;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCanReceiveSlack.mockResolvedValue(true);
    ({ maybeNotifyMasterApproversWhenGatesComplete: fn } = await import('../masterApprovalService'));
  });

  it('does nothing when the updated criterion is not a gate', async () => {
    mockGetSettings.mockResolvedValue({ master_approver_emails: ['cpo@example.com'] });
    const supabase = buildMockSupabase([
      { data: { id: 'lcs-1', criterion: { gate: false } }, error: null },
    ]);
    await fn('epic-1', 'lcs-1', supabase as any);
    expect(mockSendSlack).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does nothing when no master approvers are configured', async () => {
    mockGetSettings.mockResolvedValue({ master_approver_emails: [] });
    const supabase = buildMockSupabase([
      { data: { id: 'lcs-1', criterion: { gate: true } }, error: null },
    ]);
    await fn('epic-1', 'lcs-1', supabase as any);
    expect(mockSendSlack).not.toHaveBeenCalled();
  });

  it('does not notify while any gate is still undecided', async () => {
    mockGetSettings.mockResolvedValue({ master_approver_emails: ['cpo@example.com'] });
    const supabase = buildMockSupabase([
      { data: { id: 'g1', criterion: { gate: true } }, error: null }, // updated row
      { data: [GATE_ROW('GO', 'g1'), GATE_ROW('NOT_SET', 'g2')], error: null }, // gate rows
    ]);
    await fn('epic-1', 'g1', supabase as any);
    expect(mockSendSlack).not.toHaveBeenCalled();
  });

  it('notifies the master approver once every gate is decided', async () => {
    mockGetSettings.mockResolvedValue({ master_approver_emails: ['cpo@example.com'] });
    const supabase = buildMockSupabase([
      { data: { id: 'g1', criterion: { gate: true } }, error: null }, // updated row
      { data: [GATE_ROW('GO', 'g1'), GATE_ROW('CONDITIONAL', 'g2')], error: null }, // gate rows
      { data: { name: 'My Epic' }, error: null }, // epic
      { data: [APPROVER], error: null }, // approvers
    ]);
    await fn('epic-1', 'g1', supabase as any);
    expect(mockSendSlack).toHaveBeenCalledTimes(1);
    expect(mockSendSlack).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'master_approval_ready',
        recipient: expect.objectContaining({ email: 'cpo@example.com' }),
        metadata: expect.objectContaining({ epic_name: 'My Epic', gate_count: 2 }),
      })
    );
  });

  it('respects an approver who opted out (channel = none)', async () => {
    mockGetSettings.mockResolvedValue({ master_approver_emails: ['cpo@example.com'] });
    const supabase = buildMockSupabase([
      { data: { id: 'g1', criterion: { gate: true } }, error: null },
      { data: [GATE_ROW('GO', 'g1')], error: null },
      { data: { name: 'My Epic' }, error: null },
      { data: [{ ...APPROVER, notification_preferences: { master_approval_ready: 'none' } }], error: null },
    ]);
    await fn('epic-1', 'g1', supabase as any);
    expect(mockSendSlack).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('sends email when the approver prefers email', async () => {
    mockGetSettings.mockResolvedValue({ master_approver_emails: ['cpo@example.com'] });
    const supabase = buildMockSupabase([
      { data: { id: 'g1', criterion: { gate: true } }, error: null },
      { data: [GATE_ROW('GO', 'g1')], error: null },
      { data: { name: 'My Epic' }, error: null },
      { data: [{ ...APPROVER, notification_preferences: { master_approval_ready: 'email' } }], error: null },
    ]);
    await fn('epic-1', 'g1', supabase as any);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'master_approval_ready', recipientEmail: 'cpo@example.com' })
    );
    expect(mockSendSlack).not.toHaveBeenCalled();
  });
});
