/**
 * actorCan must answer from the *effective* rules, not the compiled-in defaults.
 *
 * This is the whole point of the module. An admin who narrows a capability in
 * Settings writes an override into app_settings.permissions; a check that closes
 * over DEFAULT_RULES cannot see it, so the surface using that check silently
 * keeps allowing something the UI has already stopped allowing. The MCP
 * connector and the Slack approval path both had this bug.
 *
 * The assertions below deliberately pin actorCan *against* canRolesPerform, so
 * that if someone ever re-points actorCan at DEFAULT_RULES the test says exactly
 * what broke rather than just going red.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { actorCan } from '../permissions-server';
import { canRolesPerform } from '../permissions';

const mockRules = jest.fn();
jest.mock('@/lib/settings-db', () => ({
    getEffectivePermissionRules: (...args: unknown[]) => mockRules(...args),
}));

const SUPABASE = {} as unknown as SupabaseClient;

beforeEach(() => {
    mockRules.mockReset();
});

describe('actorCan', () => {
    it('honours an override that REMOVES a role the defaults allow', async () => {
        // PMM can approve by default...
        expect(canRolesPerform(['PMM'], 'launchArtifact.approve')).toBe(true);

        // ...but an admin has narrowed it to CPO only.
        mockRules.mockResolvedValue({ 'launchArtifact.approve': ['CPO'] });

        await expect(
            actorCan({ roles: ['PMM'] }, 'launchArtifact.approve', SUPABASE)
        ).resolves.toBe(false);
    });

    it('honours an override that ADDS a role the defaults refuse', async () => {
        expect(canRolesPerform(['ENG'], 'launchArtifact.approve')).toBe(false);

        mockRules.mockResolvedValue({ 'launchArtifact.approve': ['ENG'] });

        await expect(
            actorCan({ roles: ['ENG'] }, 'launchArtifact.approve', SUPABASE)
        ).resolves.toBe(true);
    });

    it('keeps the SUPERADMIN short-circuit even when no rule lists them', async () => {
        mockRules.mockResolvedValue({ 'launchArtifact.approve': ['CPO'] });

        await expect(
            actorCan({ roles: ['SUPERADMIN'] }, 'launchArtifact.approve', SUPABASE)
        ).resolves.toBe(true);
    });

    it('refuses an actor with no roles — the legacy shared-key path', async () => {
        mockRules.mockResolvedValue({ 'launchArtifact.approve': ['PMM'] });

        await expect(
            actorCan({ roles: [] }, 'launchArtifact.approve', SUPABASE)
        ).resolves.toBe(false);
        await expect(
            actorCan({ roles: null }, 'launchArtifact.approve', SUPABASE)
        ).resolves.toBe(false);
    });

    it('passes the caller-supplied client through to the rules lookup', async () => {
        // The MCP route hands tools a service-role client; resolving rules with a
        // cookie-backed default would read as anon and find no settings row.
        mockRules.mockResolvedValue({});

        await actorCan({ roles: ['PM'] }, 'criteria.status.update', SUPABASE);

        expect(mockRules).toHaveBeenCalledWith(SUPABASE);
    });
});
