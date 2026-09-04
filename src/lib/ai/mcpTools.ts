/**
 * The MCP tool registry, adapted for the in-app ClearGO assistant.
 *
 * The assistant and the Claude Desktop connector answer questions about the same
 * data, and until now they did it with two independently written tool sets. That
 * is not a tidiness problem. The assistant's own `update_criterion_status` wrote
 * to epic_criterion_status directly: no capability check, no readiness
 * recompute, no status-history row, no gate sign-off nudge. Its
 * `get_my_pending_actions` resolved ownership as decision_owner_id alone, so a
 * PM who owns items only through the pod->PM mapping was told "All caught up!" --
 * the precise bug myWorkService was written to end.
 *
 * Both surfaces now build from one table. A tool added for Claude Desktop is
 * available in the assistant the same day, with the same gating, and there is
 * nowhere for a second implementation to hide.
 *
 * The actor is synthetic but not fake: the email is the signed-in user and the
 * roles are read from their app_user row, so every capability check behaves as it
 * does over OAuth. A user with no profile gets no roles and every gated tool
 * refuses -- which is the right answer, not a bug.
 */
import { tool, type ToolSet } from 'ai';
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MCP_TOOLS } from '@/lib/mcp/tools';
import { resolveMcpActor } from '@/lib/mcp/actor';
import type { McpAuthInfo } from '@/lib/oauth/tokens';

/**
 * The signed-in user as an MCP actor.
 *
 * clientId names this surface so anything logging the actor can tell an
 * assistant call from a Claude Desktop one.
 */
export async function actorForAgent(
    supabase: SupabaseClient,
    userEmail: string
): Promise<McpAuthInfo> {
    const resolved = await resolveMcpActor(supabase, {
        email: userEmail,
        roles: [],
        scopes: [],
        clientId: 'cleargo-agent',
    });

    return {
        email: userEmail,
        roles: resolved?.roles ?? [],
        scopes: ['cleargo:read', 'cleargo:write'],
        clientId: 'cleargo-agent',
    };
}

export function buildMcpBackedTools(supabase: SupabaseClient, actor: McpAuthInfo): ToolSet {
    const tools: ToolSet = {};

    for (const definition of MCP_TOOLS) {
        tools[definition.name] = tool({
            description: definition.description,
            inputSchema: z.object(definition.inputSchema),
            execute: async (args: Record<string, unknown>) => {
                try {
                    return await definition.handler(supabase, args ?? {}, actor);
                } catch (err) {
                    // Same treatment the MCP registrar gives: the message can
                    // carry database detail, so it is logged in full and
                    // generalised for the model.
                    console.error(`[cleargo-agent] ${definition.name} error:`, err);
                    return { error: 'Internal server error' };
                }
            },
        });
    }

    return tools;
}
