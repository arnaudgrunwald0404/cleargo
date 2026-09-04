import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { registerClearGoTools } from './tools';

/**
 * Build the tool surface for one MCP request.
 *
 * `actor` is the authenticated caller, resolved from the OAuth access token in
 * src/app/api/mcp/route.ts. It is threaded into every tool because the writes are
 * capability-checked against that person's ClearGO roles -- the server itself
 * holds a service-role client, so the actor is the only thing limiting a call.
 *
 * Every tool now lives in the registry table in ./tools, including the five
 * team-management ones that used to be registered inline here. That is not
 * tidying: the in-app ClearGO agent builds its own tool set from the same table,
 * so anything registered outside it would be reachable from Claude Desktop and
 * not from the assistant.
 */
export function createClearGoMcpServer(
  supabase: SupabaseClient,
  actor: McpAuthInfo
): McpServer {
  const server = new McpServer(
    { name: 'cleargo', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  registerClearGoTools(server, supabase, actor);

  return server;
}
