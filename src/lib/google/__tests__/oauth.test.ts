import {
    buildAuthorizeUrl,
    getRedirectUri,
    isOAuthConfigured,
    isExpired,
    OAUTH_SCOPES,
} from '../oauth';

const VARS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'NEXT_PUBLIC_APP_URL'] as const;

describe('OAuth configuration', () => {
    const original: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const v of VARS) {
            original[v] = process.env[v];
            delete process.env[v];
        }
    });

    afterEach(() => {
        for (const v of VARS) {
            if (original[v] === undefined) delete process.env[v];
            else process.env[v] = original[v];
        }
    });

    it('is unconfigured without both client id and secret', () => {
        expect(isOAuthConfigured()).toBe(false);
        process.env.GOOGLE_OAUTH_CLIENT_ID = 'id';
        expect(isOAuthConfigured()).toBe(false);
        process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret';
        expect(isOAuthConfigured()).toBe(true);
    });

    describe('getRedirectUri', () => {
        it('falls back to the request origin so localhost works unconfigured', () => {
            expect(getRedirectUri('http://localhost:3000')).toBe(
                'http://localhost:3000/api/integrations/google/oauth'
            );
        });

        it('prefers NEXT_PUBLIC_APP_URL when set', () => {
            process.env.NEXT_PUBLIC_APP_URL = 'https://launch-console.clearcompany.com';
            expect(getRedirectUri('http://localhost:3000')).toBe(
                'https://launch-console.clearcompany.com/api/integrations/google/oauth'
            );
        });

        it('tolerates a trailing slash rather than producing a double slash', () => {
            // A double slash would not match the registered redirect URI and
            // Google would reject the whole flow with redirect_uri_mismatch.
            process.env.NEXT_PUBLIC_APP_URL = 'https://example.com/';
            expect(getRedirectUri('http://localhost:3000')).toBe(
                'https://example.com/api/integrations/google/oauth'
            );
        });
    });

    describe('buildAuthorizeUrl', () => {
        beforeEach(() => {
            process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-123';
            process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret';
        });

        it('requests offline access and forces the consent prompt', () => {
            // Without BOTH, Google omits the refresh token on re-authorisation
            // and the connection silently dies in an hour with no way to renew.
            const url = new URL(buildAuthorizeUrl('https://example.com', 'state-abc'));
            expect(url.searchParams.get('access_type')).toBe('offline');
            expect(url.searchParams.get('prompt')).toBe('consent');
        });

        it('carries the CSRF state through', () => {
            const url = new URL(buildAuthorizeUrl('https://example.com', 'state-abc'));
            expect(url.searchParams.get('state')).toBe('state-abc');
        });

        it('asks for full drive, not drive.file', () => {
            // drive.file only covers files this app created, so it cannot read
            // the templates the doc factory must copy.
            const scope = new URL(buildAuthorizeUrl('https://example.com', 's')).searchParams.get('scope') ?? '';
            expect(scope).toContain('https://www.googleapis.com/auth/drive');
            expect(scope).not.toContain('drive.file');
        });

        it('asks for documents and the connected email', () => {
            const scope = new URL(buildAuthorizeUrl('https://example.com', 's')).searchParams.get('scope') ?? '';
            expect(scope).toContain('auth/documents');
            expect(scope).toContain('userinfo.email');
        });

        it('sends the same redirect URI the callback will use', () => {
            const url = new URL(buildAuthorizeUrl('https://example.com', 's'));
            expect(url.searchParams.get('redirect_uri')).toBe(getRedirectUri('https://example.com'));
        });
    });
});

describe('isExpired', () => {
    it('treats a missing expiry as expired rather than assuming validity', () => {
        expect(isExpired(null)).toBe(true);
    });

    it('treats an unparseable expiry as expired', () => {
        expect(isExpired('not a date')).toBe(true);
    });

    it('is expired for a past timestamp', () => {
        expect(isExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
    });

    it('refreshes early rather than at the exact moment of expiry', () => {
        // Two minutes of validity left still counts as expired: a token that
        // dies mid-request is worse than one refreshed slightly too often.
        expect(isExpired(new Date(Date.now() + 2 * 60 * 1000).toISOString())).toBe(true);
    });

    it('is valid comfortably ahead of the skew window', () => {
        expect(isExpired(new Date(Date.now() + 30 * 60 * 1000).toISOString())).toBe(false);
    });
});

describe('OAUTH_SCOPES', () => {
    it('are all fully-qualified Google scope URLs', () => {
        for (const scope of OAUTH_SCOPES) {
            expect(scope).toMatch(/^https:\/\/www\.googleapis\.com\/auth\//);
        }
    });
});
