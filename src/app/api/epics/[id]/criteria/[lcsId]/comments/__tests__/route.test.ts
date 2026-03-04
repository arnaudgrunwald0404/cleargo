/**
 * Tests for POST /api/epics/[id]/criteria/[lcsId]/comments
 * Focuses on @-mention notification routing logic.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createMockRequest } from '@/lib/__tests__/test-utils';

// ─── next/server mock ────────────────────────────────────────────────────────

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
  NextRequest: class {},
}));

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSendSlackNotification = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock('@/lib/slack/notifications', () => ({
  sendSlackNotification: mockSendSlackNotification,
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedUserEmail: jest.fn().mockResolvedValue('commenter@example.com'),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COMMENTER = {
  id: 'commenter-id',
  email: 'commenter@example.com',
  first_name: 'Cam',
  last_name: 'Commenter',
  name: 'Cam Commenter',
};

const OWNER = {
  id: 'owner-id',
  email: 'owner@example.com',
  first_name: 'Owen',
  last_name: 'Owner',
  name: 'Owen Owner',
  slack_handle: 'UOWNER1',
};

const ALICE = {
  id: 'alice-id',
  email: 'alice@example.com',
  first_name: 'Alice',
  last_name: 'Smith',
  name: 'Alice Smith',
  slack_handle: 'UALICE1',
};

const BOB = {
  id: 'bob-id',
  email: 'bob@example.com',
  first_name: 'Bob',
  last_name: 'Jones',
  name: 'Bob Jones',
  slack_handle: 'UBOB111',
};

const CRITERION_STATUS = (owner: typeof OWNER | null = OWNER) => ({
  id: 'lcs-1',
  epic: { id: 'epic-1', name: 'My Epic' },
  criterion: { id: 'crit-1', label: 'Content Ready' },
  decision_owner: owner,
});

// ─── Supabase mock builder ────────────────────────────────────────────────────

/**
 * Each call to supabase.from() can have different behaviour.
 * We set up a queue of return values for sequential calls.
 */
function buildMockSupabase(calls: Array<{ data: any; error: any }>) {
  let callIndex = 0;

  const mockFrom = jest.fn().mockImplementation(() => {
    const result = calls[callIndex] ?? { data: null, error: null };
    callIndex++;

    // Build a chain object that:
    // - Returns itself for all chainable methods (select, insert, eq, in, order, etc.)
    // - Resolves to `result` for terminal methods (.single(), .maybeSingle())
    // - Is itself thenable so `await chain` resolves to `result` (for queries without a terminal)
    const chain: any = {
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      single: jest.fn().mockResolvedValue(result),
      maybeSingle: jest.fn().mockResolvedValue(result),
    };
    for (const method of ['select', 'insert', 'eq', 'neq', 'in', 'order', 'limit', 'filter', 'match']) {
      chain[method] = jest.fn().mockReturnValue(chain);
    }
    return chain;
  });

  return { from: mockFrom };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return createMockRequest({ method: 'POST', body });
}

const PARAMS = Promise.resolve({ id: 'epic-1', lcsId: 'lcs-1' });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/epics/[id]/criteria/[lcsId]/comments — mention notifications', () => {
  let POST: (typeof import('../route'))['POST'];
  let createClient: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    ({ POST } = await import('../route'));
    ({ createClient } = await import('@/lib/supabase/server') as any);
  });

  it('sends no notification when there is no decision owner and no mentions', async () => {
    const supabase = buildMockSupabase([
      // 1. app_user lookup for commenter
      { data: COMMENTER, error: null },
      // 2. Insert comment
      { data: { id: 'comment-1', comment_text: 'hello' }, error: null },
      // 3. Fetch criterion status (no decision owner)
      { data: CRITERION_STATUS(null), error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: 'hello', mentioned_user_ids: [] });
    const res = await POST(req, { params: PARAMS });

    expect(res.status).toBe(201);
    expect(mockSendSlackNotification).not.toHaveBeenCalled();
  });

  it('sends a DM to the decision owner when there are no mentions', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: { id: 'comment-1', comment_text: 'hello' }, error: null },
      { data: CRITERION_STATUS(OWNER), error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: 'hello', mentioned_user_ids: [] });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).toHaveBeenCalledTimes(1);
    expect(mockSendSlackNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: expect.objectContaining({ id: OWNER.id }),
      })
    );
    const call = mockSendSlackNotification.mock.calls[0][0] as any;
    expect(call.recipients).toBeUndefined();
  });

  it('does NOT notify the decision owner when the commenter IS the owner', async () => {
    const ownerAsCommenter = { ...OWNER, email: 'commenter@example.com' };
    const { getAuthenticatedUserEmail } = await import('@/lib/api-auth') as any;
    getAuthenticatedUserEmail.mockResolvedValue('commenter@example.com');

    const supabase = buildMockSupabase([
      { data: { ...COMMENTER, id: OWNER.id }, error: null },
      { data: { id: 'comment-1', comment_text: 'hello' }, error: null },
      { data: CRITERION_STATUS(ownerAsCommenter as any), error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: 'hello', mentioned_user_ids: [] });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).not.toHaveBeenCalled();
  });

  it('does NOT notify the commenter when they @-mention themselves', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      // mention validation: commenter-id is in the DB
      { data: [{ id: COMMENTER.id }], error: null },
      { data: { id: 'comment-1', comment_text: '<span data-mention-user-id="commenter-id">@Cam</span> hello' }, error: null },
      { data: CRITERION_STATUS(null), error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({
      comment_text: '<span>hello</span>',
      mentioned_user_ids: [COMMENTER.id],
    });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).not.toHaveBeenCalled();
  });

  it('sends a DM when a single other user is @-mentioned and there is no decision owner', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      // mention validation
      { data: [{ id: ALICE.id }], error: null },
      { data: { id: 'comment-1' }, error: null },
      { data: CRITERION_STATUS(null), error: null },
      // fetch mentioned users for notification
      { data: [ALICE], error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({
      comment_text: '@Alice hello',
      mentioned_user_ids: [ALICE.id],
    });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).toHaveBeenCalledTimes(1);
    expect(mockSendSlackNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: expect.objectContaining({ id: ALICE.id }),
      })
    );
  });

  it('sends an MPDM when the decision owner + one mention = two distinct recipients', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: [{ id: ALICE.id }], error: null },
      { data: { id: 'comment-1' }, error: null },
      { data: CRITERION_STATUS(OWNER), error: null },
      { data: [ALICE], error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({
      comment_text: '@Alice hello',
      mentioned_user_ids: [ALICE.id],
    });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).toHaveBeenCalledTimes(1);
    expect(mockSendSlackNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: expect.arrayContaining([
          expect.objectContaining({ id: OWNER.id }),
          expect.objectContaining({ id: ALICE.id }),
        ]),
      })
    );
  });

  it('sends an MPDM when two users are @-mentioned and there is no decision owner', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: [{ id: ALICE.id }, { id: BOB.id }], error: null },
      { data: { id: 'comment-1' }, error: null },
      { data: CRITERION_STATUS(null), error: null },
      { data: [ALICE, BOB], error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({
      comment_text: '@Alice @Bob hello',
      mentioned_user_ids: [ALICE.id, BOB.id],
    });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).toHaveBeenCalledTimes(1);
    expect(mockSendSlackNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: expect.arrayContaining([
          expect.objectContaining({ id: ALICE.id }),
          expect.objectContaining({ id: BOB.id }),
        ]),
      })
    );
  });

  it('does not duplicate the decision owner when they are also @-mentioned', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      // mention validation: owner is in the DB
      { data: [{ id: OWNER.id }], error: null },
      { data: { id: 'comment-1' }, error: null },
      { data: CRITERION_STATUS(OWNER), error: null },
      // fetch mentioned users: returns the owner
      { data: [OWNER], error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({
      comment_text: '@Owen hello',
      mentioned_user_ids: [OWNER.id],
    });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).toHaveBeenCalledTimes(1);
    const call = mockSendSlackNotification.mock.calls[0][0] as any;

    // Single recipient (owner), not doubled
    const recipients: any[] = call.recipients ?? (call.recipient ? [call.recipient] : []);
    const ownerCount = recipients.filter((r: any) => r.id === OWNER.id).length;
    expect(ownerCount).toBe(1);
  });

  it('commenter @-mentioning themselves alongside another user: only the other user is notified', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      // mention validation: both IDs exist
      { data: [{ id: COMMENTER.id }, { id: ALICE.id }], error: null },
      { data: { id: 'comment-1' }, error: null },
      { data: CRITERION_STATUS(null), error: null },
      { data: [ALICE], error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({
      comment_text: '@Cam @Alice hello',
      mentioned_user_ids: [COMMENTER.id, ALICE.id],
    });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).toHaveBeenCalledTimes(1);
    expect(mockSendSlackNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: expect.objectContaining({ id: ALICE.id }),
      })
    );

    // Commenter must not appear in the notification
    const call = mockSendSlackNotification.mock.calls[0][0] as any;
    const recipients: any[] = call.recipients ?? (call.recipient ? [call.recipient] : []);
    expect(recipients.some((r: any) => r.id === COMMENTER.id)).toBe(false);
  });

  it('returns 400 when comment text is empty after stripping HTML', async () => {
    const supabase = buildMockSupabase([{ data: COMMENTER, error: null }]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: '<p>  </p>', mentioned_user_ids: [] });
    const res = await POST(req, { params: PARAMS });

    expect(res.status).toBe(400);
    expect(mockSendSlackNotification).not.toHaveBeenCalled();
  });

  it('returns 201 and still returns the comment even when Slack notification fails', async () => {
    mockSendSlackNotification.mockRejectedValueOnce(new Error('Slack API error'));

    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: { id: 'comment-1', comment_text: 'hello' }, error: null },
      { data: CRITERION_STATUS(OWNER), error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: 'hello', mentioned_user_ids: [] });
    const res = await POST(req, { params: PARAMS });

    expect(res.status).toBe(201);
  });
});
