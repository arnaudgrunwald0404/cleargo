/**
 * Tests for POST /api/epics/[id]/criteria/[lcsId]/comments
 * Covers recipient routing: decision owner, @-mentions, thread participants (I-6),
 * distinct per-reason sends (I-3), and orphan first-comment watchers (I-5).
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

const mockGetSettings = jest.fn<() => Promise<any>>().mockResolvedValue({});
jest.mock('@/lib/settings-db', () => ({
  getSettings: mockGetSettings,
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

const DAN = {
  id: 'dan-id',
  email: 'dan@example.com',
  first_name: 'Dan',
  last_name: 'Lead',
  name: 'Dan Lead',
  slack_handle: 'UDAN111',
};

const CRITERION_STATUS = (
  owner: typeof OWNER | null = OWNER,
  epicExtra: Record<string, unknown> = {}
) => ({
  id: 'lcs-1',
  epic: { id: 'epic-1', name: 'My Epic', owner_email: null, pod: null, ...epicExtra },
  criterion: { id: 'crit-1', label: 'Content Ready' },
  decision_owner: owner,
});

// ─── Supabase mock builder ────────────────────────────────────────────────────

function buildMockSupabase(calls: Array<{ data: any; error: any }>) {
  let callIndex = 0;
  const mockFrom = jest.fn().mockImplementation(() => {
    const result = calls[callIndex] ?? { data: null, error: null };
    callIndex++;
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

/** Flatten recipients across ALL sendSlackNotification calls (sends are now grouped by reason). */
function allRecipients(): any[] {
  const out: any[] = [];
  for (const [payload] of mockSendSlackNotification.mock.calls as any[]) {
    if (payload.recipients) out.push(...payload.recipients);
    else if (payload.recipient) out.push(payload.recipient);
  }
  return out;
}

/** The reason attached to the call that included a recipient with the given id. */
function reasonForRecipient(id: string): string | undefined {
  for (const [payload] of mockSendSlackNotification.mock.calls as any[]) {
    const recips = payload.recipients ?? (payload.recipient ? [payload.recipient] : []);
    if (recips.some((r: any) => r.id === id)) return payload.metadata?.reason;
  }
  return undefined;
}

const PARAMS = Promise.resolve({ id: 'epic-1', lcsId: 'lcs-1' });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/epics/[id]/criteria/[lcsId]/comments — notification routing', () => {
  let POST: (typeof import('../route'))['POST'];
  let createClient: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSendSlackNotification.mockResolvedValue(undefined);
    mockGetSettings.mockResolvedValue({});
    ({ POST } = await import('../route'));
    ({ createClient } = await import('@/lib/supabase/server') as any);
  });

  it('sends no notification when there is no decision owner and no mentions', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null }, // commenter lookup
      { data: { id: 'comment-1', comment_text: 'hello' }, error: null }, // insert
      { data: CRITERION_STATUS(null), error: null }, // criterion status
      { data: [], error: null }, // priorComments (first comment)
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
      { data: [], error: null }, // priorComments
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: 'hello', mentioned_user_ids: [] });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).toHaveBeenCalledTimes(1);
    const call = mockSendSlackNotification.mock.calls[0][0] as any;
    expect(call.recipient?.id).toBe(OWNER.id);
    expect(call.recipients).toBeUndefined();
    expect(call.metadata.reason).toBe('owner');
  });

  it('does NOT notify the decision owner when the commenter IS the owner', async () => {
    const ownerAsCommenter = { ...OWNER, email: 'commenter@example.com' };
    const supabase = buildMockSupabase([
      { data: { ...COMMENTER, id: OWNER.id }, error: null },
      { data: { id: 'comment-1', comment_text: 'hello' }, error: null },
      { data: CRITERION_STATUS(ownerAsCommenter as any), error: null },
      { data: [], error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: 'hello', mentioned_user_ids: [] });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).not.toHaveBeenCalled();
  });

  it('does NOT notify the commenter when they @-mention themselves', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: [{ id: COMMENTER.id }], error: null }, // mention validation
      { data: { id: 'comment-1', comment_text: '@Cam hello' }, error: null },
      { data: CRITERION_STATUS(null), error: null },
      { data: [], error: null }, // priorComments
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({
      comment_text: '<span>hello</span>',
      mentioned_user_ids: [COMMENTER.id],
    });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).not.toHaveBeenCalled();
  });

  it('sends a DM to a single @-mentioned user (reason: mention)', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: [{ id: ALICE.id }], error: null }, // mention validation
      { data: { id: 'comment-1' }, error: null },
      { data: CRITERION_STATUS(null), error: null },
      { data: [], error: null }, // priorComments
      { data: [ALICE], error: null }, // mentioned users
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: '@Alice hello', mentioned_user_ids: [ALICE.id] });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).toHaveBeenCalledTimes(1);
    const call = mockSendSlackNotification.mock.calls[0][0] as any;
    expect(call.recipient?.id).toBe(ALICE.id);
    expect(call.metadata.reason).toBe('mention');
  });

  it('notifies both the owner and a mention, in separate reason-tagged sends', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: [{ id: ALICE.id }], error: null },
      { data: { id: 'comment-1' }, error: null },
      { data: CRITERION_STATUS(OWNER), error: null },
      { data: [], error: null }, // priorComments
      { data: [ALICE], error: null }, // mentioned users
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: '@Alice hello', mentioned_user_ids: [ALICE.id] });
    await POST(req, { params: PARAMS });

    const recips = allRecipients();
    expect(recips.filter((r) => r.id === OWNER.id)).toHaveLength(1);
    expect(recips.filter((r) => r.id === ALICE.id)).toHaveLength(1);
    expect(reasonForRecipient(ALICE.id)).toBe('mention');
    expect(reasonForRecipient(OWNER.id)).toBe('owner');
  });

  it('sends an MPDM when two users are @-mentioned (same reason group)', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: [{ id: ALICE.id }, { id: BOB.id }], error: null },
      { data: { id: 'comment-1' }, error: null },
      { data: CRITERION_STATUS(null), error: null },
      { data: [], error: null }, // priorComments
      { data: [ALICE, BOB], error: null }, // mentioned users
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
        metadata: expect.objectContaining({ reason: 'mention' }),
      })
    );
  });

  it('does not duplicate the decision owner when they are also @-mentioned (mention wins)', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: [{ id: OWNER.id }], error: null },
      { data: { id: 'comment-1' }, error: null },
      { data: CRITERION_STATUS(OWNER), error: null },
      { data: [], error: null }, // priorComments
      { data: [OWNER], error: null }, // mentioned users
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: '@Owen hello', mentioned_user_ids: [OWNER.id] });
    await POST(req, { params: PARAMS });

    const recips = allRecipients();
    expect(recips.filter((r) => r.id === OWNER.id)).toHaveLength(1);
    expect(reasonForRecipient(OWNER.id)).toBe('mention');
  });

  it('notifies a prior thread participant on a new reply, even without a re-mention', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: { id: 'comment-2', comment_text: 'reply' }, error: null },
      { data: CRITERION_STATUS(null), error: null },
      { data: [{ created_by: ALICE.id, mentioned_user_ids: null }], error: null }, // priorComments
      { data: [ALICE], error: null }, // participant users
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: 'thanks for the update', mentioned_user_ids: [] });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).toHaveBeenCalledTimes(1);
    const call = mockSendSlackNotification.mock.calls[0][0] as any;
    expect(call.recipient?.id).toBe(ALICE.id);
    expect(call.metadata.reason).toBe('thread_reply');
  });

  it('notifies a user @-mentioned earlier in the thread on a later reply', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: { id: 'comment-2', comment_text: 'reply' }, error: null },
      { data: CRITERION_STATUS(null), error: null },
      { data: [{ created_by: 'someone-else-id', mentioned_user_ids: [BOB.id] }], error: null },
      { data: [BOB], error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: 'following up', mentioned_user_ids: [] });
    await POST(req, { params: PARAMS });

    expect(mockSendSlackNotification).toHaveBeenCalledTimes(1);
    expect((mockSendSlackNotification.mock.calls[0][0] as any).recipient?.id).toBe(BOB.id);
  });

  it('does not double-notify a thread participant who is also owner or freshly @-mentioned', async () => {
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: [{ id: ALICE.id }], error: null }, // mention validation
      { data: { id: 'comment-2' }, error: null },
      { data: CRITERION_STATUS(OWNER), error: null },
      {
        data: [
          { created_by: OWNER.id, mentioned_user_ids: null },
          { created_by: ALICE.id, mentioned_user_ids: null },
        ],
        error: null,
      }, // priorComments
      { data: [OWNER, ALICE], error: null }, // participant users
      { data: [ALICE], error: null }, // mentioned users
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: '@Alice hello', mentioned_user_ids: [ALICE.id] });
    await POST(req, { params: PARAMS });

    const recips = allRecipients();
    expect(recips.filter((r) => r.id === OWNER.id)).toHaveLength(1);
    expect(recips.filter((r) => r.id === ALICE.id)).toHaveLength(1);
    expect(reasonForRecipient(ALICE.id)).toBe('mention'); // mention beats thread_reply
    expect(reasonForRecipient(OWNER.id)).toBe('thread_reply'); // participation beats plain owner
  });

  it('I-5: routes an orphan first comment (no @mention) to configured watchers + epic owner', async () => {
    mockGetSettings.mockResolvedValue({
      orphan_comment_watcher_emails: ['dan@example.com'],
      pod_product_manager_mapping: {},
    });
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: { id: 'comment-1', comment_text: 'first!' }, error: null },
      { data: CRITERION_STATUS(null, { owner_email: 'alice@example.com' }), error: null },
      { data: [], error: null }, // priorComments (first comment)
      { data: [DAN, ALICE], error: null }, // watcher users (dan + epic owner alice)
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: 'first comment, nobody tagged', mentioned_user_ids: [] });
    await POST(req, { params: PARAMS });

    const recips = allRecipients();
    expect(recips.map((r) => r.id).sort()).toEqual([ALICE.id, DAN.id].sort());
    expect(reasonForRecipient(DAN.id)).toBe('orphan_watch');
  });

  it('does NOT trigger orphan watchers when the comment has a mention', async () => {
    mockGetSettings.mockResolvedValue({ orphan_comment_watcher_emails: ['dan@example.com'] });
    const supabase = buildMockSupabase([
      { data: COMMENTER, error: null },
      { data: [{ id: ALICE.id }], error: null },
      { data: { id: 'comment-1' }, error: null },
      { data: CRITERION_STATUS(null, { owner_email: 'x@example.com' }), error: null },
      { data: [], error: null }, // priorComments
      { data: [ALICE], error: null }, // mentioned users
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: '@Alice look', mentioned_user_ids: [ALICE.id] });
    await POST(req, { params: PARAMS });

    const recips = allRecipients();
    expect(recips.some((r) => r.id === DAN.id)).toBe(false);
    expect(recips.map((r) => r.id)).toEqual([ALICE.id]);
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
      { data: [], error: null },
    ]);
    createClient.mockReturnValue(supabase);

    const req = makeRequest({ comment_text: 'hello', mentioned_user_ids: [] });
    const res = await POST(req, { params: PARAMS });

    expect(res.status).toBe(201);
  });
});
