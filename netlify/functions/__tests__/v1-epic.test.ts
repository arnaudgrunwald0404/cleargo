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
const handler = (require('../v1-epic') as { default: Handler }).default;

const EPIC_ID = 'epic-001';

function makeRequest(params: Record<string, string> = { id: EPIC_ID }): Request {
  const url = new URL('http://localhost/api/v1/epic');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe('v1-epic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when API key is invalid', async () => {
    authMock.validateApiKey.mockReturnValue(false);
    const res = await handler(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 400 when id is missing', async () => {
    authMock.validateApiKey.mockReturnValue(true);
    const res = await handler(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when epic is not found', async () => {
    authMock.validateApiKey.mockReturnValue(true);

    const mockFrom = jest.fn();
    supabaseMock.createAdminSupabase.mockReturnValue({ from: mockFrom });

    // .from('epic').select().eq().single()
    const epicChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    };
    mockFrom.mockReturnValueOnce(epicChain);

    const res = await handler(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns epic detail with computed fields on success', async () => {
    authMock.validateApiKey.mockReturnValue(true);

    const mockFrom = jest.fn();
    supabaseMock.createAdminSupabase.mockReturnValue({ from: mockFrom });

    const epic = {
      id: EPIC_ID,
      name: 'Payments V2',
      status: 'IN_FLIGHT',
      tier: 'TIER_1',
      target_launch_date: '2026-06-01',
      risk_level: 'medium',
      readiness_score: 75,
      owner_id: 'u1',
      product_id: 'prod1',
    };

    const owner = { id: 'u1', name: 'Alice', email: 'alice@co.com' };
    const product = { id: 'prod1', name: 'Core', pillar: 'Growth', pod: 'Monetization' };
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

    const blockers = [
      { id: 'b1', epic_id: EPIC_ID, title: 'Gateway down', description: null, severity: 'critical', status: 'open', logged_at: fourDaysAgo },
      { id: 'b2', epic_id: EPIC_ID, title: 'Old bug', description: null, severity: 'low', status: 'resolved', logged_at: fourDaysAgo },
    ];

    const milestones = [
      { id: 'm1', name: 'Alpha launch', due_date: '2026-05-01', completed_at: null, status: 'pending' },
    ];

    const criteriaRows = [
      { status: 'GO' },
      { status: 'NO_GO' },
      { status: 'NOT_SET' },
    ];

    // Epic query: .from('epic').select().eq().single()
    const epicChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: epic, error: null }),
    };

    // Owner query: .from('app_user').select().eq().single()
    const ownerChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: owner, error: null }),
    };

    // Product query: .from('product').select().eq().single()
    const productChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: product, error: null }),
    };

    // Blockers query: .from('blocker').select().eq().order()
    const blockersChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: blockers, error: null }),
    };

    // Milestones query: .from('epic_milestone').select().eq().order()
    const milestonesChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: milestones, error: null }),
    };

    // Criteria query: .from('epic_criterion_status').select().eq()
    const criteriaChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: criteriaRows, error: null }),
    };

    mockFrom
      .mockReturnValueOnce(epicChain)
      .mockReturnValueOnce(ownerChain)
      .mockReturnValueOnce(productChain)
      .mockReturnValueOnce(blockersChain)
      .mockReturnValueOnce(milestonesChain)
      .mockReturnValueOnce(criteriaChain);

    const res = await handler(makeRequest());
    expect(res.status).toBe(200);

    const detail = await res.json();

    expect(detail.criteria_summary.total).toBe(3);
    expect(detail.criteria_summary.go).toBe(1);
    expect(detail.criteria_summary.no_go).toBe(1);

    const criticalBlocker = detail.blockers.find((b: { id: string }) => b.id === 'b1');
    expect(criticalBlocker.needs_escalation).toBe(true);

    expect(detail.owner.name).toBe('Alice');
    expect(detail.milestones).toHaveLength(1);
  });
});
