/**
 * @jest-environment node
 *
 * Node, not jsdom: update-criterion-status reaches scoreEpicCriterion, whose gate
 * sign-off nudge pulls in the email client and from there react-dom's server
 * renderer, which needs TextEncoder. jsdom does not provide one. Nothing here
 * touches the DOM.
 */

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
import { updateCriterionStatus } from '../update-criterion-status';
import { getSuccessMetrics } from '../get-success-metrics';
import { adjustConfidence } from '../adjust-confidence';
import { setImpactOverride } from '../set-impact-override';

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

const mockConfig = jest.fn();
const mockMetrics = jest.fn();
jest.mock('@/lib/services/successMeasurementService', () => ({
    getEpicSuccessConfig: (...args: unknown[]) => mockConfig(...args),
    getEpicSuccessMetrics: (...args: unknown[]) => mockMetrics(...args),
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

/**
 * update-criterion-status is gated one level down: scoreEpicCriterion owns the
 * capability check and returns a `forbidden` outcome rather than throwing. What
 * matters here is that the tool surfaces that reason instead of flattening it
 * into a generic failure, because the registrar turns a throw into "Internal
 * server error" and the caller learns nothing.
 *
 * OTHER, not ENG: ENG may score criteria by default, so using it would prove
 * nothing.
 */
describe('update-criterion-status', () => {
    const args = {
        epicId: '11111111-1111-4111-8111-111111111111',
        statusRowId: '22222222-2222-4222-8222-222222222222',
        status: 'GO',
    };

    /** Dispatches by table so the app_user lookup and the row read differ. */
    function clientFor(appUserRoles: string[] | null) {
        const seen: string[] = [];
        const client = {
            from: (table: string) => {
                seen.push(table);
                if (table === 'app_user') {
                    return {
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: appUserRoles
                                        ? {
                                              id: '33333333-3333-4333-8333-333333333333',
                                              email: 'someone@clearcompany.com',
                                              roles: appUserRoles,
                                          }
                                        : null,
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: null, error: null }),
                            }),
                        }),
                    }),
                };
            },
        } as unknown as SupabaseClient;
        return { client, seen };
    }

    it('surfaces the refusal reason for a role that cannot score criteria', async () => {
        const { client, seen } = clientFor(['OTHER']);

        const result = await updateCriterionStatus(client, args, actor(['OTHER']));

        expect(result).toEqual({ error: 'You do not have permission to score criteria.' });
        // Refused before reading the criterion row.
        expect(seen).not.toContain('epic_criterion_status');
    });

    it('refuses when the caller has no ClearGO profile to attribute the change to', async () => {
        // last_updated_by and audit_log.actor_id are uuid FKs to app_user, so
        // there is no safe way to record an unattributable write.
        const { client } = clientFor(null);

        const result = await updateCriterionStatus(client, args, actor(['PM']));

        expect(result).toMatchObject({
            error: expect.stringContaining('No ClearGO user profile found'),
        });
    });

    it('reads roles from the database, not from the access token', async () => {
        // The token is an hour long; a role change should not have to wait it
        // out. Token says PM, the profile says OTHER, and the profile wins.
        const { client } = clientFor(['OTHER']);

        const result = await updateCriterionStatus(client, args, actor(['PM']));

        expect(result).toEqual({ error: 'You do not have permission to score criteria.' });
    });

    it('lets a permitted role through to the criterion lookup', async () => {
        const { client, seen } = clientFor(['PM']);

        await updateCriterionStatus(client, args, actor(['PM']));

        expect(seen).toContain('epic_criterion_status');
    });

    it('rejects a call that would change nothing', async () => {
        const { client, seen } = clientFor(['PM']);

        const result = await updateCriterionStatus(client, { ...args, status: undefined }, actor(['PM']));

        expect(result).toMatchObject({ error: expect.stringContaining('Nothing to update') });
        expect(seen).toHaveLength(0);
    });
});

/**
 * The unpublished-metrics rule exists only in the HTTP route, so the connector
 * has to carry its own copy. Getting it wrong leaks draft targets that the UI
 * deliberately hides, and the failure is invisible until someone quotes an
 * unpublished number at a stakeholder.
 */
describe('get-success-metrics visibility', () => {
    const EPIC = '44444444-4444-4444-8444-444444444444';
    const SUPABASE = {} as unknown as SupabaseClient;

    beforeEach(() => {
        mockConfig.mockReset();
        mockMetrics.mockReset();
        mockMetrics.mockResolvedValue([{ id: 'm1' }]);
    });

    it('hides an unpublished plan from someone who cannot configure it', async () => {
        mockConfig.mockResolvedValue({ success_metrics_published_at: null, locked_at: null });

        const result = (await getSuccessMetrics(SUPABASE, { epicId: EPIC }, actor(['ENG']))) as {
            metrics: unknown[];
            note?: string;
        };

        expect(result.metrics).toEqual([]);
        // Not an empty list on its own -- "hidden" and "none" must be tellable apart.
        expect(result.note).toContain('not published');
        expect(mockMetrics).not.toHaveBeenCalled();
    });

    it('shows an unpublished plan to someone who can configure success measurement', async () => {
        mockConfig.mockResolvedValue({ success_metrics_published_at: null, locked_at: null });

        const result = (await getSuccessMetrics(SUPABASE, { epicId: EPIC }, actor(['PRODUCT_OPS']))) as {
            metrics: unknown[];
        };

        expect(result.metrics).toHaveLength(1);
    });

    it('shows a published plan to everyone', async () => {
        mockConfig.mockResolvedValue({
            success_metrics_published_at: '2026-01-01T00:00:00Z',
            locked_at: null,
        });

        const result = (await getSuccessMetrics(SUPABASE, { epicId: EPIC }, actor(['ENG']))) as {
            metrics: unknown[];
        };

        expect(result.metrics).toHaveLength(1);
    });

    it('reports a missing config as absent rather than hidden', async () => {
        mockConfig.mockResolvedValue(null);

        const result = (await getSuccessMetrics(SUPABASE, { epicId: EPIC }, actor(['ENG']))) as {
            config: unknown;
            note?: string;
        };

        expect(result.config).toBeNull();
        expect(result.note).toBeUndefined();
    });
});

describe('roadmap writes', () => {
    const CONFIDENCE_ARGS = {
        ahaKey: 'CC-EPIC-1',
        snapshotDate: '2026-09-01',
        newAdjustment: 5,
    };
    const OVERRIDE_ARGS = {
        ahaKey: 'CC-EPIC-1',
        weekStart: '2026-09-01',
        originalImpact: 'low',
        overrideImpact: 'high',
    };

    it('refuses a confidence adjustment for a role without the capability', async () => {
        const result = await adjustConfidence(NO_DB, CONFIDENCE_ARGS, actor(['ENG']));

        expect(result).toEqual({
            error: 'You do not have permission to adjust confidence ratings.',
        });
    });

    it('refuses an impact override for a role without the capability', async () => {
        const result = await setImpactOverride(NO_DB, OVERRIDE_ARGS, actor(['ENG']));

        expect(result).toEqual({
            error: 'You do not have permission to override movement impact.',
        });
    });

    it('refuses the legacy shared-key actor, which carries no roles', async () => {
        await expect(adjustConfidence(NO_DB, CONFIDENCE_ARGS, actor([]))).resolves.toMatchObject({
            error: expect.stringContaining('permission'),
        });
        await expect(setImpactOverride(NO_DB, OVERRIDE_ARGS, actor([]))).resolves.toMatchObject({
            error: expect.stringContaining('permission'),
        });
    });

    it('rejects an out-of-range adjustment before checking anything else', async () => {
        // Schema first: a 500-point "adjustment" is not a permissions question.
        const result = await adjustConfidence(NO_DB, { ...CONFIDENCE_ARGS, newAdjustment: 500 }, actor(['PM']));

        expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') });
    });

    it('lets a PM through to the database', async () => {
        let reached = false;
        const supabase = {
            from: () => {
                reached = true;
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                        }),
                    }),
                };
            },
        } as unknown as SupabaseClient;

        await adjustConfidence(supabase, CONFIDENCE_ARGS, actor(['PM']));

        expect(reached).toBe(true);
    });
});
