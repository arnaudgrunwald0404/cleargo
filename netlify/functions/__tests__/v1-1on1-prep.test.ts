import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../_shared/auth', () => ({
  validateApiKey: jest.fn(),
}));

jest.mock('../_shared/supabase', () => ({
  createAdminSupabase: jest.fn(),
}));

jest.mock('../_shared/response', () => ({
  ok: (data: unknown) => new Response(JSON.stringify(data), { status: 200 }),
  notFound: (msg?: string) => new Response(JSON.stringify({ error: msg }), { status: 404 }),
  unauthorized: () => new Response('{"error":"Unauthorized"}', { status: 401 }),
  badRequest: (msg?: string) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
  internalError: () => new Response('{"error":"Internal server error"}', { status: 500 }),
}));

type Handler = (req: Request) => Promise<Response>;

const authMock = jest.requireMock('../_shared/auth') as { validateApiKey: jest.Mock };
const supabaseMock = jest.requireMock('../_shared/supabase') as { createAdminSupabase: jest.Mock };
const handler = (require('../v1-1on1-prep') as { default: Handler }).default;

const PERSON_ID = 'p1';

function makeRequest(params: Record<string, string> = { person_id: PERSON_ID }): Request {
  const url = new URL('http://localhost/api/v1/1on1-prep');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe('v1-1on1-prep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when API key is invalid', async () => {
    authMock.validateApiKey.mockReturnValue(false);
    const res = await handler(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 400 when person_id is missing', async () => {
    authMock.validateApiKey.mockReturnValue(true);
    const res = await handler(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when person not found', async () => {
    authMock.validateApiKey.mockReturnValue(true);

    const mockFrom = jest.fn();
    supabaseMock.createAdminSupabase.mockReturnValue({ from: mockFrom });

    // .from('app_user').select().eq().single()
    const personChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    };
    mockFrom.mockReturnValueOnce(personChain);

    const res = await handler(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns full prep doc on success', async () => {
    authMock.validateApiKey.mockReturnValue(true);

    const mockFrom = jest.fn();
    supabaseMock.createAdminSupabase.mockReturnValue({ from: mockFrom });

    const person = { id: PERSON_ID, name: 'Alice', email: 'alice@co.com', role: 'PM' };
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    const activeEpics = [
      { id: 'e1', name: 'Epic Alpha', status: 'IN_FLIGHT', tier: 'TIER_1', target_launch_date: null, risk_level: null, readiness_score: 80, product: { name: 'Core' } },
      { id: 'e2', name: 'Epic Beta', status: 'IN_FLIGHT', tier: 'TIER_2', target_launch_date: null, risk_level: null, readiness_score: 60, product: null },
    ];

    const completedEpics = [
      { id: 'e3', name: 'Epic Gamma', status: 'LAUNCHED', tier: 'TIER_1', target_launch_date: null, risk_level: null, readiness_score: 100, product: null },
    ];

    const blockers = [
      {
        id: 'b1',
        epic_id: 'e1',
        title: 'API outage',
        description: null,
        severity: 'high',
        status: 'open',
        logged_at: fiveDaysAgo,
        epic: { name: 'Epic Alpha', owner_id: PERSON_ID },
      },
    ];

    // Person query: .from('app_user').select().eq().single()
    const personChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: person, error: null }),
    };

    // Active epics: .from('epic').select().eq().not()
    const activeChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockResolvedValue({ data: activeEpics, error: null }),
    };

    // Completed epics: .from('epic').select().eq().in().gte()
    const completedChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      gte: jest.fn().mockResolvedValue({ data: completedEpics, error: null }),
    };

    // Blockers: .from('blocker').select().eq()
    const blockersChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: blockers, error: null }),
    };

    mockFrom
      .mockReturnValueOnce(personChain)
      .mockReturnValueOnce(activeChain)
      .mockReturnValueOnce(completedChain)
      .mockReturnValueOnce(blockersChain);

    const res = await handler(makeRequest());
    expect(res.status).toBe(200);

    const doc = await res.json();

    expect(doc.summary.active_epics).toBe(2);
    expect(doc.summary.escalations_needed).toBe(1);
    expect(doc.escalations_needed).toHaveLength(1);
    expect(doc.escalations_needed[0].blocker_title).toBe('API outage');
    expect(doc.suggested_talking_points.length).toBeGreaterThan(0);
    expect(doc.generated_at).toBeDefined();
  });
});
