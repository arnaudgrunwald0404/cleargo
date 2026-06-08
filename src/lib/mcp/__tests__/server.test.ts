import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  queryTeamMembers,
  queryOneOnOnePrep,
  queryMemberEpics,
  queryMemberBlockers,
  queryEpicDetail,
} from '../queries';

function buildMockSupabase(fromImpl: jest.Mock) {
  return { from: fromImpl } as any;
}

function chainable(overrides: Record<string, any> = {}): Record<string, jest.Mock> {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  for (const [k, v] of Object.entries(overrides)) {
    chain[k] = v;
  }
  return chain;
}

describe('MCP queries', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('queryTeamMembers', () => {
    it('returns formatted team member list with epic counts', async () => {
      const members = [
        { id: 'u1', name: 'Alice', email: 'alice@co.com', role: 'PM', slack_handle: 'alice' },
        { id: 'u2', name: 'Bob', email: 'bob@co.com', role: 'ENG', slack_handle: null },
      ];

      const mockFrom = jest.fn();

      const membersChain = chainable();
      // Two .eq() calls: manager_email then is_active — second resolves
      membersChain.eq
        .mockReturnValueOnce(membersChain)
        .mockResolvedValueOnce({ data: members, error: null });

      const epicChain = chainable();
      epicChain.not.mockResolvedValue({
        data: [{ owner_id: 'u1' }, { owner_id: 'u1' }, { owner_id: 'u2' }],
        error: null,
      });

      mockFrom.mockReturnValueOnce(membersChain).mockReturnValueOnce(epicChain);

      const result = await queryTeamMembers(buildMockSupabase(mockFrom));

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({ id: 'u1', active_epics_count: 2, open_blockers_count: 0 })
      );
      expect(result[1]).toEqual(
        expect.objectContaining({ id: 'u2', active_epics_count: 1, open_blockers_count: 0 })
      );
    });

    it('returns empty array when no members found', async () => {
      const mockFrom = jest.fn();
      const membersChain = chainable();
      membersChain.eq
        .mockReturnValueOnce(membersChain)
        .mockResolvedValueOnce({ data: [], error: null });
      mockFrom.mockReturnValueOnce(membersChain);

      const result = await queryTeamMembers(buildMockSupabase(mockFrom));
      expect(result).toEqual([]);
    });
  });

  describe('queryOneOnOnePrep', () => {
    it('returns prep doc for valid person_id', async () => {
      const person = { id: 'p1', name: 'Dan', email: 'dan@co.com', role: 'PM' };
      const activeEpic = {
        id: 'e1', name: 'Epic One', status: 'IN_PROGRESS', tier: 'TIER_1',
        target_launch_date: '2026-06-01', risk_level: 'low', readiness_score: 80,
        product: { name: 'Platform' },
      };

      const mockFrom = jest.fn();

      // person query
      const personChain = chainable();
      personChain.single.mockResolvedValue({ data: person, error: null });
      mockFrom.mockReturnValueOnce(personChain);

      // active epics query
      const activeChain = chainable();
      activeChain.not.mockResolvedValue({ data: [activeEpic], error: null });
      mockFrom.mockReturnValueOnce(activeChain);

      // completed this week query
      const completedChain = chainable();
      completedChain.gte.mockResolvedValue({ data: [], error: null });
      mockFrom.mockReturnValueOnce(completedChain);

      // criteria statuses
      const csChain = chainable();
      // .in('epic_id', ...) then .in('status', ...) — second resolves
      csChain.in
        .mockReturnValueOnce(csChain)
        .mockResolvedValueOnce({ data: [], error: null });
      mockFrom.mockReturnValueOnce(csChain);

      const doc = await queryOneOnOnePrep(buildMockSupabase(mockFrom), 'p1');

      expect(doc.person).toEqual(person);
      expect(doc.active_epics).toHaveLength(1);
      expect(doc.active_epics[0].name).toBe('Epic One');
      expect(doc.summary.active_epics).toBe(1);
      expect(doc.generated_at).toBeDefined();
    });

    it('throws for unknown person_id', async () => {
      const mockFrom = jest.fn();
      const personChain = chainable();
      personChain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockFrom.mockReturnValueOnce(personChain);

      await expect(queryOneOnOnePrep(buildMockSupabase(mockFrom), 'bad-id')).rejects.toThrow(
        'Person not found'
      );
    });
  });

  describe('queryMemberEpics', () => {
    it('returns epics for a valid member', async () => {
      const member = { id: 'm1', name: 'Alice', email: 'alice@co.com' };
      const epics = [
        {
          id: 'e1', name: 'Epic A', status: 'IN_PROGRESS', tier: 'TIER_1',
          target_launch_date: null, risk_level: 'medium', readiness_score: 50,
          product: { name: 'Prod' },
        },
      ];

      const mockFrom = jest.fn();

      const memberChain = chainable();
      memberChain.single.mockResolvedValue({ data: member, error: null });
      mockFrom.mockReturnValueOnce(memberChain);

      const epicsChain = chainable();
      // The query ends with .eq('owner_id', ...) which resolves since no statusFilter
      // Actually: select → eq('owner_id') which resolves since no status filter
      // The `await query` in the source triggers the thenable
      (epicsChain as any).then = (resolve: any, reject: any) =>
        Promise.resolve({ data: epics, error: null }).then(resolve, reject);
      mockFrom.mockReturnValueOnce(epicsChain);

      const result = await queryMemberEpics(buildMockSupabase(mockFrom), 'm1');

      expect(result.member).toEqual(member);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].product_name).toBe('Prod');
    });

    it('throws for unknown member', async () => {
      const mockFrom = jest.fn();
      const memberChain = chainable();
      memberChain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockFrom.mockReturnValueOnce(memberChain);

      await expect(queryMemberEpics(buildMockSupabase(mockFrom), 'bad-id')).rejects.toThrow(
        'Team member not found'
      );
    });
  });

  describe('queryMemberBlockers', () => {
    it('returns blockers with escalation flags', async () => {
      const member = { id: 'm1', name: 'Alice', email: 'alice@co.com' };
      const epics = [{ id: 'e1', name: 'Epic One' }];
      const threeDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString();
      const criteriaStatuses = [
        {
          id: 'cs1', epic_id: 'e1', criterion_id: 'c1', status: 'NO_GO',
          current_status_notes: 'Blocked on legal', condition_due_date: null,
          last_updated_at: threeDaysAgo,
          criterion: { label: 'Legal review', gate: true },
        },
      ];

      const mockFrom = jest.fn();

      const memberChain = chainable();
      memberChain.single.mockResolvedValue({ data: member, error: null });
      mockFrom.mockReturnValueOnce(memberChain);

      const epicsChain = chainable();
      epicsChain.not.mockResolvedValue({ data: epics, error: null });
      mockFrom.mockReturnValueOnce(epicsChain);

      const csChain = chainable();
      csChain.in
        .mockReturnValueOnce(csChain)
        .mockResolvedValueOnce({ data: criteriaStatuses, error: null });
      mockFrom.mockReturnValueOnce(csChain);

      const result = await queryMemberBlockers(buildMockSupabase(mockFrom), 'm1');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].severity).toBe('critical');
      expect(result.data[0].needs_escalation).toBe(true);
      expect(result.data[0].title).toBe('Legal review');
    });
  });

  describe('queryEpicDetail', () => {
    it('returns epic detail for valid epic_id', async () => {
      const epic = {
        id: 'e1', name: 'Big Launch', status: 'IN_PROGRESS', tier: 'TIER_1',
        target_launch_date: '2026-07-01', risk_level: 'high', readiness_score: 45,
        owner_id: 'o1', product_id: 'p1',
      };
      const owner = { id: 'o1', name: 'Owner', email: 'owner@co.com' };
      const product = { id: 'p1', name: 'Platform', pillar: 'Core', pod: 'Alpha' };
      const blockers = [
        {
          id: 'b1', epic_id: 'e1', title: 'Blocked', description: null,
          severity: 'high', status: 'open', logged_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        },
      ];
      const milestones = [
        { id: 'ms1', name: 'Milestone 1', due_date: '2026-06-15', completed_at: null, status: 'pending' },
      ];
      const criteria = [
        { status: 'GO' }, { status: 'GO' }, { status: 'NO_GO' }, { status: 'NOT_SET' },
      ];

      const mockFrom = jest.fn();

      // epic query
      const epicChain = chainable();
      epicChain.single.mockResolvedValue({ data: epic, error: null });
      mockFrom.mockReturnValueOnce(epicChain);

      // owner query
      const ownerChain = chainable();
      ownerChain.single.mockResolvedValue({ data: owner, error: null });
      mockFrom.mockReturnValueOnce(ownerChain);

      // product query
      const productChain = chainable();
      productChain.single.mockResolvedValue({ data: product, error: null });
      mockFrom.mockReturnValueOnce(productChain);

      // blockers query
      const blockersChain = chainable();
      blockersChain.order.mockResolvedValue({ data: blockers, error: null });
      mockFrom.mockReturnValueOnce(blockersChain);

      // milestones query
      const milestonesChain = chainable();
      milestonesChain.order.mockResolvedValue({ data: milestones, error: null });
      mockFrom.mockReturnValueOnce(milestonesChain);

      // criteria query
      const criteriaChain = chainable();
      // eq resolves (terminal)
      criteriaChain.eq.mockResolvedValue({ data: criteria, error: null });
      mockFrom.mockReturnValueOnce(criteriaChain);

      const detail = await queryEpicDetail(buildMockSupabase(mockFrom), 'e1');

      expect(detail.id).toBe('e1');
      expect(detail.owner).toEqual(owner);
      expect(detail.product).toEqual(product);
      expect(detail.blockers).toHaveLength(1);
      expect(detail.blockers[0].needs_escalation).toBe(true);
      expect(detail.milestones).toHaveLength(1);
      expect(detail.criteria_summary).toEqual({ total: 4, go: 2, no_go: 1, conditional: 0, not_set: 1 });
    });

    it('throws for unknown epic_id', async () => {
      const mockFrom = jest.fn();
      const epicChain = chainable();
      epicChain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      mockFrom.mockReturnValueOnce(epicChain);

      await expect(queryEpicDetail(buildMockSupabase(mockFrom), 'bad-id')).rejects.toThrow(
        'Epic not found'
      );
    });
  });
});
