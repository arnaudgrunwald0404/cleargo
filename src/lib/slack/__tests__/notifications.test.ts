/**
 * Tests for sendSlackNotification — multi-recipient / @-mention logic
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Slack client mock ────────────────────────────────────────────────────────

const mockPostMessage = jest.fn<() => Promise<{ ts: string }>>().mockResolvedValue({ ts: 'ts-123' });
const mockOpenConversation = jest.fn<(id: string) => Promise<string>>().mockResolvedValue('DM-channel');
const mockOpenMultiUserConversation = jest.fn<(ids: string[]) => Promise<string>>().mockResolvedValue('MPDM-channel');
const mockGetUserByEmail = jest.fn<() => Promise<{ user: { id: string } } | null>>().mockResolvedValue(null);

jest.mock('../client', () => ({
  getSlackClient: () => ({
    postMessage: mockPostMessage,
    openConversation: mockOpenConversation,
    openMultiUserConversation: mockOpenMultiUserConversation,
    getUserByEmail: mockGetUserByEmail,
  }),
}));

// ─── Supabase admin client mock ───────────────────────────────────────────────
// Used by logNotification and canReceiveSlackNotification

const mockAdminInsert = jest.fn().mockResolvedValue({ error: null });
const mockAdminMaybeSingle = jest.fn().mockResolvedValue({
  data: { receive_slack_notifications: true },
  error: null,
});
const mockAdminUpdateEq = jest.fn().mockResolvedValue({ error: null });

const mockAdminFrom = jest.fn().mockImplementation((table: string) => ({
  insert: mockAdminInsert,
  select: jest.fn().mockReturnValue({
    ilike: jest.fn().mockReturnValue({ maybeSingle: mockAdminMaybeSingle }),
    eq: jest.fn().mockReturnThis(),
  }),
  update: jest.fn().mockReturnValue({ eq: mockAdminUpdateEq }),
}));

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(() => ({ from: mockAdminFrom })),
}));

// ─── Settings + theme mocks ───────────────────────────────────────────────────

jest.mock('@/lib/settings-db', () => ({
  getSettings: jest.fn().mockResolvedValue({
    slack_notifications_enabled: true,
    slack_criterion_comment_or_attachment: true,
    slack_delegation: true,
  }),
}));

jest.mock('../theme', () => ({
  getSlackTheme: jest.fn().mockResolvedValue({}),
}));

jest.mock('../templates', () => ({
  buildCriterionCommentOrAttachmentMessage: jest.fn().mockReturnValue({ text: 'msg', blocks: [] }),
  buildCriteriaAssignmentMessage: jest.fn().mockReturnValue({ text: '', blocks: [] }),
  buildStaleCriterionMessage: jest.fn().mockReturnValue({ text: '', blocks: [] }),
  buildLaunchRiskAlertMessage: jest.fn().mockReturnValue({ text: '', blocks: [] }),
  buildGoNoGoDecisionMessage: jest.fn().mockReturnValue({ text: '', blocks: [] }),
  buildLeadershipDigestMessage: jest.fn().mockReturnValue({ text: '', blocks: [] }),
  buildLaunchStatusChangeMessage: jest.fn().mockReturnValue({ text: '', blocks: [] }),
  buildDelegationMessage: jest.fn().mockReturnValue({ text: '', blocks: [] }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<{
  id: string; email: string; slack_handle: string | null; name: string;
}> = {}) {
  return {
    id: overrides.id ?? 'user-1',
    email: overrides.email ?? 'user1@example.com',
    // Use 'in' check so explicitly passing null/undefined suppresses the default
    slack_handle: 'slack_handle' in overrides ? overrides.slack_handle : 'U111111',
    name: overrides.name ?? 'User One',
  };
}

const BASE_PAYLOAD = {
  type: 'criterion_comment_or_attachment' as const,
  priority: 'medium' as const,
  launch_id: 'epic-1',
  metadata: {
    epic_name: 'My Epic',
    epic_id: 'epic-1',
    criterion_label: 'Content Ready',
    criterion_status_id: 'lcs-1',
    added_by_name: 'Alice',
    has_comment: true,
    has_attachment: false,
    comment_text: 'hello',
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sendSlackNotification — multi-recipient (@-mention) logic', () => {
  let sendSlackNotification: (typeof import('../notifications'))['sendSlackNotification'];

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset all mocks to defaults
    mockPostMessage.mockResolvedValue({ ts: 'ts-123' });
    mockOpenConversation.mockResolvedValue('DM-channel');
    mockOpenMultiUserConversation.mockResolvedValue('MPDM-channel');
    mockGetUserByEmail.mockResolvedValue(null);
    mockAdminInsert.mockResolvedValue({ error: null });
    mockAdminMaybeSingle.mockResolvedValue({ data: { receive_slack_notifications: true }, error: null });
    mockAdminUpdateEq.mockResolvedValue({ error: null });

    ({ sendSlackNotification } = await import('../notifications'));
  });

  // ── Single recipient ────────────────────────────────────────────────────────

  describe('single recipient (recipient field)', () => {
    it('sends a DM when the recipient has a valid Slack handle', async () => {
      await sendSlackNotification({ ...BASE_PAYLOAD, recipient: makeUser() });

      expect(mockOpenConversation).toHaveBeenCalledWith('U111111');
      expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: 'DM-channel' }));
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });

    it('skips sending when the recipient has notifications disabled', async () => {
      mockAdminMaybeSingle.mockResolvedValue({ data: { receive_slack_notifications: false }, error: null });

      await sendSlackNotification({ ...BASE_PAYLOAD, recipient: makeUser() });

      expect(mockPostMessage).not.toHaveBeenCalled();
    });
  });

  // ── recipients array with 1 element (was a latent bug) ─────────────────────

  describe('recipients array with exactly 1 element', () => {
    it('falls through to a DM instead of silently dropping the notification', async () => {
      await sendSlackNotification({ ...BASE_PAYLOAD, recipients: [makeUser()] });

      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      expect(mockOpenConversation).toHaveBeenCalledWith('U111111');
      expect(mockOpenMultiUserConversation).not.toHaveBeenCalled();
    });
  });

  // ── Two valid recipients → MPDM ─────────────────────────────────────────────

  describe('two valid recipients (MPDM)', () => {
    it('opens a multi-party DM and posts exactly one message', async () => {
      const alice = makeUser({ id: 'alice', email: 'alice@example.com', slack_handle: 'UA11111' });
      const bob   = makeUser({ id: 'bob',   email: 'bob@example.com',   slack_handle: 'UB22222' });

      await sendSlackNotification({ ...BASE_PAYLOAD, recipients: [alice, bob] });

      expect(mockOpenMultiUserConversation).toHaveBeenCalledWith(['UA11111', 'UB22222']);
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: 'MPDM-channel' }));
    });

    it('logs a notification_log row for each recipient', async () => {
      const alice = makeUser({ id: 'alice', email: 'alice@example.com', slack_handle: 'UA11111' });
      const bob   = makeUser({ id: 'bob',   email: 'bob@example.com',   slack_handle: 'UB22222' });

      await sendSlackNotification({ ...BASE_PAYLOAD, recipients: [alice, bob] });

      // One insert call per recipient
      expect(mockAdminInsert).toHaveBeenCalledTimes(2);
    });
  });

  // ── One missing handle, sync fails → single DM ─────────────────────────────

  describe('two recipients — one without Slack handle, sync fails', () => {
    it('drops the handleless user and sends a DM to the remaining one', async () => {
      const alice = makeUser({ id: 'alice', email: 'alice@example.com', slack_handle: 'UA11111' });
      const bob   = makeUser({ id: 'bob',   email: 'bob@example.com',   slack_handle: null });

      mockGetUserByEmail.mockResolvedValue(null); // sync fails for bob

      await sendSlackNotification({ ...BASE_PAYLOAD, recipients: [alice, bob] });

      expect(mockOpenMultiUserConversation).not.toHaveBeenCalled();
      expect(mockOpenConversation).toHaveBeenCalledWith('UA11111');
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ── One missing handle, sync succeeds → MPDM ───────────────────────────────

  describe('two recipients — one without Slack handle, sync succeeds', () => {
    it('syncs the handle and sends MPDM to both', async () => {
      const alice = makeUser({ id: 'alice', email: 'alice@example.com', slack_handle: 'UA11111' });
      const bob   = makeUser({ id: 'bob',   email: 'bob@example.com',   slack_handle: null });

      mockGetUserByEmail.mockResolvedValue({ user: { id: 'UB22222' } });

      await sendSlackNotification({ ...BASE_PAYLOAD, recipients: [alice, bob] });

      expect(mockOpenMultiUserConversation).toHaveBeenCalledWith(
        expect.arrayContaining(['UA11111', 'UB22222'])
      );
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ── All notifications disabled ──────────────────────────────────────────────

  describe('two recipients — both have notifications disabled', () => {
    it('sends nothing', async () => {
      mockAdminMaybeSingle.mockResolvedValue({ data: { receive_slack_notifications: false }, error: null });

      const alice = makeUser({ id: 'alice', email: 'alice@example.com', slack_handle: 'UA11111' });
      const bob   = makeUser({ id: 'bob',   email: 'bob@example.com',   slack_handle: 'UB22222' });

      await sendSlackNotification({ ...BASE_PAYLOAD, recipients: [alice, bob] });

      expect(mockPostMessage).not.toHaveBeenCalled();
      expect(mockOpenMultiUserConversation).not.toHaveBeenCalled();
    });
  });

  // ── One notification disabled → DM to the other ────────────────────────────

  describe('two recipients — one has notifications disabled', () => {
    it('sends a DM only to the enabled recipient', async () => {
      const alice = makeUser({ id: 'alice', email: 'alice@example.com', slack_handle: 'UA11111' });
      const bob   = makeUser({ id: 'bob',   email: 'bob@example.com',   slack_handle: 'UB22222' });

      mockAdminMaybeSingle.mockImplementation(async () => {
        // Intercept via the chain: canReceiveSlackNotification does
        // .from('app_user').select(...).ilike(...).maybeSingle()
        // We need to check which email is being queried — simplify by tracking calls
        const callCount = mockAdminMaybeSingle.mock.calls.length;
        // First call: alice (enabled), second call: bob (disabled)
        return callCount % 2 === 1
          ? { data: { receive_slack_notifications: true }, error: null }
          : { data: { receive_slack_notifications: false }, error: null };
      });

      await sendSlackNotification({ ...BASE_PAYLOAD, recipients: [alice, bob] });

      // valid = [alice] → single path → DM
      expect(mockOpenMultiUserConversation).not.toHaveBeenCalled();
      expect(mockOpenConversation).toHaveBeenCalledWith('UA11111');
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ── Three recipients, two valid ─────────────────────────────────────────────

  describe('three recipients — two valid, one without handle', () => {
    it('sends MPDM to the two valid recipients', async () => {
      const alice  = makeUser({ id: 'alice',  email: 'alice@example.com',  slack_handle: 'UA11111' });
      const bob    = makeUser({ id: 'bob',    email: 'bob@example.com',    slack_handle: 'UB22222' });
      const carol  = makeUser({ id: 'carol',  email: 'carol@example.com',  slack_handle: null });

      mockGetUserByEmail.mockResolvedValue(null); // carol sync fails

      await sendSlackNotification({ ...BASE_PAYLOAD, recipients: [alice, bob, carol] });

      expect(mockOpenMultiUserConversation).toHaveBeenCalledWith(['UA11111', 'UB22222']);
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ── Unsupported type with multiple recipients ────────────────────────────────

  describe('non-comment type with multiple recipients', () => {
    it('throws when multi-recipient is used with an unsupported notification type', async () => {
      const alice = makeUser({ id: 'alice', email: 'alice@example.com', slack_handle: 'UA11111' });
      const bob   = makeUser({ id: 'bob',   email: 'bob@example.com',   slack_handle: 'UB22222' });

      await expect(
        sendSlackNotification({
          type: 'delegation' as any,
          priority: 'medium',
          recipients: [alice, bob],
          launch_id: 'epic-1',
          metadata: {} as any,
        })
      ).rejects.toThrow('Multi-recipient is only supported for criterion_comment_or_attachment');
    });
  });
});
