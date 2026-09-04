/**
 * Capability gating on the MCP write tools.
 *
 * This is the gap the remote connector was built to close. The stdio server that
 * these tools came from checked nothing: it held the service-role key, so anyone
 * who could reach it could approve any artifact, and every approval was stamped
 * with the same placeholder address. Now each tool is handed the authenticated
 * caller and checks the same capabilities the UI route checks.
 *
 * The PM case is the one that matters — a real role that may draft and review but
 * must not approve. If that distinction stops holding, the gating is decorative.
 */
import { describe, it, expect } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { reviewArtifact } from '../review-artifact';
import { updateArtifact } from '../update-artifact';

/**
 * The gate resolves DB-configured permission overrides (lib/permissions-server),
 * so the check itself reads app_settings. Stubbing that read keeps both halves of
 * this file honest: NO_DB still proves the *tool* ran no query before refusing,
 * and `reached` in the positive cases is still set by the tool's own query rather
 * than by the settings lookup.
 *
 * Note: `jest` here is the global. Importing it from @jest/globals silently
 * disables jest.mock in this repo.
 */
jest.mock('@/lib/settings-db', () => ({
    getEffectivePermissionRules: async () =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require('@/lib/permissions') as typeof import('@/lib/permissions')).DEFAULT_RULES,
}));

function actor(roles: string[]): McpAuthInfo {
    return {
        email: 'someone@clearcompany.com',
        roles,
        scopes: ['cleargo:read', 'cleargo:write'],
        clientId: 'mcp_test',
    };
}

/**
 * Refuses to be used at all.
 *
 * A refusal must happen before any query runs — if a gate only filtered the
 * response after reading, a bug downstream could still leak or write. Touching
 * this client fails the test.
 */
const NO_DB = new Proxy({} as SupabaseClient, {
    get() {
        throw new Error('the database was touched after an authorization failure');
    },
});

describe('review-artifact', () => {
    const args = {
        launchId: 'launch-1',
        artifactType: 'story_brief',
        status: 'APPROVED',
    };

    it('refuses to approve for a PM, who may review but not approve', async () => {
        const result = await reviewArtifact(NO_DB, args, actor(['PM']));

        expect(result).toEqual({
            error: 'You do not have permission to approve launch artifacts.',
        });
    });

    it('refuses every review action for a role with no artifact capabilities', async () => {
        const result = await reviewArtifact(
            NO_DB,
            { ...args, status: 'PENDING_REVIEW' },
            actor(['ENG'])
        );

        expect(result).toEqual({
            error: 'You do not have permission to move launch artifacts through review.',
        });
    });

    it('refuses when the caller has no roles at all', async () => {
        // The legacy X-ClearGo-Key path produces exactly this actor: a service
        // credential with no person behind it.
        const result = await reviewArtifact(NO_DB, args, actor([]));

        expect(result).toMatchObject({ error: expect.stringContaining('permission') });
    });

    it('lets a PMM approve', async () => {
        // Reaching the database is the assertion: the gate let it through.
        let reached = false;
        const supabase = {
            from: () => {
                reached = true;
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                single: async () => ({ data: null, error: { message: 'stop here' } }),
                            }),
                        }),
                    }),
                };
            },
        } as unknown as SupabaseClient;

        await reviewArtifact(supabase, args, actor(['PMM']));

        expect(reached).toBe(true);
    });

    it('rejects a change request with no reason before checking anything else', async () => {
        const result = await reviewArtifact(
            NO_DB,
            { ...args, status: 'CHANGES_REQUESTED' },
            actor(['PMM'])
        );

        expect(result).toEqual({
            error: 'A change request needs a reason the next draft can act on.',
        });
    });
});

describe('update-artifact', () => {
    it('refuses content edits for a role that cannot draft', async () => {
        const result = await updateArtifact(
            NO_DB,
            { launchId: 'launch-1', artifactType: 'story_brief', content: { value_story: 'x' } },
            actor(['ENG'])
        );

        expect(result).toEqual({
            error: 'You do not have permission to edit artifact content.',
        });
    });
});
