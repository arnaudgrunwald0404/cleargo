/**
 * @jest-environment node
 *
 * The node environment, not the project-wide jsdom default: NextResponse.json
 * needs the static `Response.json`, which jsdom does not provide, and asserting
 * on real status codes is the whole point of this file.
 *
 * GET /api/settings/permissions must not be public.
 *
 * It had no authorization at all while returning the org's whole email -> role
 * mapping, every capability, and every override. It answered 200 to an
 * unauthenticated request in production.
 *
 * These tests are about the gate, not the payload shaping.
 */
const mockGetAuthenticatedUserEmail = jest.fn();
const mockGetEffectivePermissionRules = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/api-auth', () => ({
    getAuthenticatedUserEmail: () => mockGetAuthenticatedUserEmail(),
}));

jest.mock('@/lib/supabase/server', () => ({
    createClient: () => ({ from: (t: string) => mockFrom(t) }),
}));

jest.mock('@/lib/settings-db', () => ({
    getSettings: async () => ({ permissions: {} }),
    updateSettings: async () => ({ permissions: {} }),
    getEffectivePermissionRules: () => mockGetEffectivePermissionRules(),
}));

import { GET } from '../route';

/** app_user lookup returning the given roles. */
function userWithRoles(roles: string[] | null) {
    mockFrom.mockReturnValue({
        select: () => ({
            eq: () => ({
                maybeSingle: async () => ({
                    data: roles === null ? null : { roles },
                    error: null,
                }),
            }),
        }),
    });
}

beforeEach(() => {
    mockGetAuthenticatedUserEmail.mockReset();
    mockGetEffectivePermissionRules.mockReset().mockResolvedValue({
        'settings.read': ['CPO', 'SUPERADMIN'],
    });
    mockFrom.mockReset();
});

describe('GET /api/settings/permissions', () => {
    it('refuses an unauthenticated caller', async () => {
        mockGetAuthenticatedUserEmail.mockResolvedValue(null);

        const res = await GET();

        expect(res.status).toBe(401);
        // The whole point: no mapping, no overrides, nothing.
        expect(await res.json()).toEqual({ error: 'Unauthorized' });
        expect(mockFrom).not.toHaveBeenCalled();
    });

    it('refuses an authenticated caller without settings.read', async () => {
        mockGetAuthenticatedUserEmail.mockResolvedValue('pm@clearcompany.com');
        userWithRoles(['PM']);

        const res = await GET();

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body).not.toHaveProperty('mapping');
        expect(body).not.toHaveProperty('overrides');
    });

    it('refuses someone with no app_user profile', async () => {
        mockGetAuthenticatedUserEmail.mockResolvedValue('stranger@example.com');
        userWithRoles(null);

        const res = await GET();

        expect(res.status).toBe(404);
    });

    it('allows a holder of settings.read', async () => {
        mockGetAuthenticatedUserEmail.mockResolvedValue('cpo@clearcompany.com');
        userWithRoles(['CPO']);

        const res = await GET();

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('capabilities');
        expect(body).toHaveProperty('overrides');
    });

    it('honours an admin override of settings.read itself', async () => {
        // Effective rules, not DEFAULT_RULES: if an admin narrows who may read
        // settings, that has to bind here too.
        mockGetEffectivePermissionRules.mockResolvedValue({ 'settings.read': ['SUPERADMIN'] });
        mockGetAuthenticatedUserEmail.mockResolvedValue('cpo@clearcompany.com');
        userWithRoles(['CPO']);

        const res = await GET();

        expect(res.status).toBe(403);
    });
});
