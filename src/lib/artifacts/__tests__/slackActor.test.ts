import { resolveActorFromSlack, actorCan } from '../slackActor';
import type { SupabaseClient } from '@supabase/supabase-js';

const USER_ID = 'b2c4d6e8-1a3b-4c5d-8e9f-0a1b2c3d4e5f';

jest.mock('@/lib/supabase/server', () => ({
    createAdminClient: jest.fn(() => {
        throw new Error('tests must pass an explicit client');
    }),
}));

const mockRules = jest.fn();
jest.mock('@/lib/settings-db', () => ({
    getEffectivePermissionRules: (...args: unknown[]) => mockRules(...args),
}));

function clientFor(row: Record<string, unknown> | null) {
    return {
        from: () => ({
            select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
            }),
        }),
    } as unknown as SupabaseClient;
}

const PMM_ROW = {
    id: USER_ID,
    email: 'pmm@clearcompany.com',
    first_name: 'Dana',
    last_name: 'Reed',
    roles: ['PMM'],
};

beforeEach(() => {
    mockRules.mockReset();
    mockRules.mockResolvedValue({
        'launchArtifact.approve': ['PMM', 'CPO', 'PRODUCT_OPS'],
        'launchArtifact.review': ['PM', 'PMM', 'PRODUCT', 'PRODUCT_OPS', 'CPO'],
    });
});

describe('resolveActorFromSlack', () => {
    it('returns the app_user id the uuid FKs require', async () => {
        const actor = await resolveActorFromSlack('U123', clientFor(PMM_ROW));
        expect(actor.id).toBe(USER_ID);
    });

    it('honours an admin override that narrows a capability', async () => {
        // The web app respects Settings overrides; before this, Slack used
        // DEFAULT_RULES and would still have let a PMM approve.
        mockRules.mockResolvedValue({
            'launchArtifact.approve': ['CPO'],
            'launchArtifact.review': ['PMM'],
        });

        const actor = await resolveActorFromSlack('U123', clientFor(PMM_ROW));
        expect(actor.allowedToApprove).toBe(false);
        expect(actor.allowedToReview).toBe(true);
    });

    it('honours an admin override that widens one', async () => {
        mockRules.mockResolvedValue({ 'launchArtifact.approve': ['PMM', 'ENG'] });
        const eng = { ...PMM_ROW, roles: ['ENG'] };
        const actor = await resolveActorFromSlack('U123', clientFor(eng));
        expect(actor.allowedToApprove).toBe(true);
    });

    it('is a fully denied stranger when the slack handle matches nobody', async () => {
        const actor = await resolveActorFromSlack('U999', clientFor(null));
        expect(actor).toEqual({
            id: null,
            email: null,
            name: null,
            roles: [],
            allowedToApprove: false,
            allowedToReview: false,
        });
    });

    it('does not touch the database without a slack user id', async () => {
        const hostile = new Proxy({} as SupabaseClient, {
            get() {
                throw new Error('the database was touched for an absent user');
            },
        });
        await expect(resolveActorFromSlack(undefined, hostile)).resolves.toMatchObject({ id: null });
    });
});

describe('actorCan', () => {
    it('checks any capability against the same effective rules', async () => {
        mockRules.mockResolvedValue({ 'criteria.status.update': ['PM'] });
        const supabase = clientFor(PMM_ROW);

        await expect(actorCan({ roles: ['PM'] }, 'criteria.status.update', supabase)).resolves.toBe(true);
        await expect(actorCan({ roles: ['ENG'] }, 'criteria.status.update', supabase)).resolves.toBe(false);
    });
});
