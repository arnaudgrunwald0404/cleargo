import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../_shared/auth', () => ({
  validateApiKey: jest.fn(),
}));

jest.mock('../_shared/supabase', () => ({
  createAdminSupabase: jest.fn(),
}));

jest.mock('../_shared/response', () => ({
  ok: (data: unknown) => new Response(JSON.stringify(data), { status: 200 }),
  unauthorized: () => new Response('{"error":"Unauthorized"}', { status: 401 }),
  badRequest: (msg?: string) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
  internalError: () => new Response('{"error":"Internal server error"}', { status: 500 }),
}));

type Handler = (req: Request) => Promise<Response>;

const authMock = jest.requireMock('../_shared/auth') as { validateApiKey: jest.Mock };
const supabaseMock = jest.requireMock('../_shared/supabase') as { createAdminSupabase: jest.Mock };
const handler = (require('../v1-team-members') as { default: Handler }).default;

function makeRequest(method = 'GET'): Request {
  return new Request('http://localhost/api/v1/team-members', { method });
}

describe('v1-team-members', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when API key is invalid', async () => {
    authMock.validateApiKey.mockReturnValue(false);
    const res = await handler(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-GET methods', async () => {
    authMock.validateApiKey.mockReturnValue(true);
    const res = await handler(makeRequest('POST'));
    expect(res.status).toBe(400);
  });

  it('returns team members with counts on success', async () => {
    authMock.validateApiKey.mockReturnValue(true);

    const members = [
      { id: 'u1', name: 'Alice', email: 'alice@co.com', role: 'PM', slack_handle: 'alice' },
      { id: 'u2', name: 'Bob', email: 'bob@co.com', role: 'ENG', slack_handle: null },
    ];

    const mockFrom = jest.fn();
    supabaseMock.createAdminSupabase.mockReturnValue({ from: mockFrom });

    // .from('app_user').select().eq('reports_to_email').eq('is_active')
    const membersChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn(),
    } as Record<string, jest.Mock>;
    membersChain.eq
      .mockReturnValueOnce(membersChain)
      .mockResolvedValueOnce({ data: members, error: null });

    // .from('epic').select().in().not()
    const epicChain = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockResolvedValue({ data: [{ owner_id: 'u1' }, { owner_id: 'u1' }], error: null }),
    };

    // .from('blocker').select().in().eq()
    const blockerChain = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [{ owner_id: 'u2' }], error: null }),
    };

    mockFrom
      .mockReturnValueOnce(membersChain)
      .mockReturnValueOnce(epicChain)
      .mockReturnValueOnce(blockerChain);

    const res = await handler(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(2);

    const alice = body.data.find((m: { id: string }) => m.id === 'u1');
    const bob = body.data.find((m: { id: string }) => m.id === 'u2');

    expect(alice.active_epics_count).toBe(2);
    expect(alice.open_blockers_count).toBe(0);
    expect(bob.active_epics_count).toBe(0);
    expect(bob.open_blockers_count).toBe(1);
  });

  it('returns 500 when Supabase errors on members query', async () => {
    authMock.validateApiKey.mockReturnValue(true);

    const mockFrom = jest.fn();
    supabaseMock.createAdminSupabase.mockReturnValue({ from: mockFrom });

    const failChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn(),
    } as Record<string, jest.Mock>;
    failChain.eq
      .mockReturnValueOnce(failChain)
      .mockResolvedValueOnce({ data: null, error: { message: 'db error' } });

    mockFrom.mockReturnValueOnce(failChain);

    const res = await handler(makeRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('db error');
  });
});
