/**
 * @jest-environment node
 */

/**
 * Parity between the assistant and the Claude Desktop connector.
 *
 * The two surfaces used to be written independently, and they drifted in the way
 * that costs the most: the assistant's own criterion write skipped the capability
 * check, the readiness recompute and the status-history row, and its pending-work
 * tool resolved ownership one way out of three, so people were told they were
 * caught up when they were not.
 *
 * These tests pin the property that stops that recurring -- every registry tool
 * reaches the assistant, and the actor it runs as carries real roles.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { MCP_TOOLS } from '@/lib/mcp/tools';
import { buildMcpBackedTools, actorForAgent } from '../mcpTools';

const ACTOR = {
    email: 'someone@clearcompany.com',
    roles: ['PM'],
    scopes: ['cleargo:read', 'cleargo:write'],
    clientId: 'cleargo-agent',
};

const SUPABASE = {} as unknown as SupabaseClient;

function clientForUser(row: Record<string, unknown> | null) {
    return {
        from: () => ({
            select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
            }),
        }),
    } as unknown as SupabaseClient;
}

describe('buildMcpBackedTools', () => {
    it('exposes every registry tool to the assistant', () => {
        const tools = buildMcpBackedTools(SUPABASE, ACTOR);

        expect(Object.keys(tools).sort()).toEqual(MCP_TOOLS.map((t) => t.name).sort());
    });

    it('carries each tool description across, so routing still works', () => {
        const tools = buildMcpBackedTools(SUPABASE, ACTOR);

        for (const definition of MCP_TOOLS) {
            expect(tools[definition.name].description).toBe(definition.description);
        }
    });

    it('includes the criterion write that the assistant used to reimplement', () => {
        const tools = buildMcpBackedTools(SUPABASE, ACTOR);

        expect(tools['update-criterion-status']).toBeDefined();
        expect(tools['get-my-work']).toBeDefined();
    });

    it('generalises a thrown error rather than leaking database detail', async () => {
        const exploding = {
            from: () => {
                throw new Error('relation "secret_table" does not exist');
            },
        } as unknown as SupabaseClient;

        const tools = buildMcpBackedTools(exploding, ACTOR);
        const result = await tools['list-launches'].execute!({}, {
            toolCallId: 't1',
            messages: [],
        });

        expect(result).toEqual({ error: 'Internal server error' });
    });
});

describe('actorForAgent', () => {
    it('reads roles from app_user rather than assuming them', async () => {
        const actor = await actorForAgent(
            clientForUser({ id: 'u1', email: 'someone@clearcompany.com', roles: ['PMM'] }),
            'someone@clearcompany.com'
        );

        expect(actor.roles).toEqual(['PMM']);
        expect(actor.email).toBe('someone@clearcompany.com');
    });

    it('gives no roles to a user with no profile, so gated tools refuse', async () => {
        // The right answer, not a bug: an unknown caller should not be able to
        // score criteria just because they reached the chat box.
        const actor = await actorForAgent(clientForUser(null), 'stranger@example.com');

        expect(actor.roles).toEqual([]);
    });

    it('names the surface so a log can tell it from a Claude Desktop call', async () => {
        const actor = await actorForAgent(clientForUser(null), 'someone@clearcompany.com');

        expect(actor.clientId).toBe('cleargo-agent');
    });
});
