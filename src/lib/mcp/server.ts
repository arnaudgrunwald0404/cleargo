import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  queryTeamMembers,
  queryOneOnOnePrep,
  queryMemberEpics,
  queryMemberBlockers,
  queryEpicDetail,
} from './queries';

export function createClearGoMcpServer(supabase: SupabaseClient): McpServer {
  const server = new McpServer(
    { name: 'cleargo', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.registerTool('list_team_members', {
    description: 'List all active direct reports with health snapshot (active epic count, open blocker count)',
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      const data = await queryTeamMembers(supabase);
      return { content: [{ type: 'text', text: JSON.stringify({ data }) }] };
    } catch (err) {
      console.error('[mcp] list_team_members error:', err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error' }) }], isError: true };
    }
  });

  server.registerTool('get_1on1_prep', {
    description: 'Get a structured 1:1 prep document for a team member — includes active epics, completed this week, escalations needed, and suggested talking points',
    inputSchema: { person_id: z.string().uuid() },
    annotations: { readOnlyHint: true },
  }, async ({ person_id }) => {
    try {
      const doc = await queryOneOnOnePrep(supabase, person_id);
      return { content: [{ type: 'text', text: JSON.stringify(doc) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error('[mcp] get_1on1_prep error:', err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
    }
  });

  server.registerTool('list_member_epics', {
    description: 'List epics owned by a team member, optionally filtered by status (PLANNED, IN_PROGRESS, LAUNCHED, CANCELLED, ARCHIVED, COMPLETED)',
    inputSchema: { member_id: z.string().uuid(), status: z.string().optional() },
    annotations: { readOnlyHint: true },
  }, async ({ member_id, status }) => {
    try {
      const result = await queryMemberEpics(supabase, member_id, status);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error('[mcp] list_member_epics error:', err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
    }
  });

  server.registerTool('list_member_blockers', {
    description: 'List open blockers for a team member\'s epics, with escalation flags pre-computed (needs_escalation=true when days_blocked >= 3 and severity is high or critical)',
    inputSchema: { member_id: z.string().uuid() },
    annotations: { readOnlyHint: true },
  }, async ({ member_id }) => {
    try {
      const result = await queryMemberBlockers(supabase, member_id);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error('[mcp] list_member_blockers error:', err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
    }
  });

  server.registerTool('get_epic_detail', {
    description: 'Get full detail for a single epic — owner, product, all blockers, milestones, and readiness criteria breakdown. Use to drill into an epic surfaced by get_1on1_prep.',
    inputSchema: { epic_id: z.string().uuid() },
    annotations: { readOnlyHint: true },
  }, async ({ epic_id }) => {
    try {
      const detail = await queryEpicDetail(supabase, epic_id);
      return { content: [{ type: 'text', text: JSON.stringify(detail) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error('[mcp] get_epic_detail error:', err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
    }
  });

  return server;
}
