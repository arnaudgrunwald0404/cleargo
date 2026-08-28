import {
    getGoogleCredentials,
    hasServiceAccountCredentials,
    GOOGLE_SCOPES,
    clearGoogleTokenCache,
} from '../auth';

const VARS = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    'GOOGLE_IMPERSONATE_SUBJECT',
] as const;

describe('service-account configuration', () => {
    const original: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const v of VARS) {
            original[v] = process.env[v];
            delete process.env[v];
        }
        clearGoogleTokenCache();
    });

    afterEach(() => {
        for (const v of VARS) {
            if (original[v] === undefined) delete process.env[v];
            else process.env[v] = original[v];
        }
    });

    it('reports unconfigured when nothing is set', () => {
        expect(hasServiceAccountCredentials()).toBe(false);
        expect(getGoogleCredentials()).toBeNull();
    });

    it('reports unconfigured with an email but no key', () => {
        // A half-configured Google is worse than none: it fails at the API call
        // instead of at the boundary check every caller uses.
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'bot@project.iam.gserviceaccount.com';
        expect(hasServiceAccountCredentials()).toBe(false);
    });

    it('reports configured without a subject, for shared-drive membership', () => {
        // Setup B: the service account is a member of the shared drive and acts
        // as itself. Requiring a subject here would force a domain-wide
        // delegation admin request before anything could be tried at all.
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'bot@project.iam.gserviceaccount.com';
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = 'key';

        expect(hasServiceAccountCredentials()).toBe(true);
        expect(getGoogleCredentials()?.subject).toBeNull();
    });

    it('carries the subject when domain-wide delegation is configured', () => {
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'bot@project.iam.gserviceaccount.com';
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = 'key';
        process.env.GOOGLE_IMPERSONATE_SUBJECT = 'cleargo-bot@clearcompany.com';

        expect(getGoogleCredentials()?.subject).toBe('cleargo-bot@clearcompany.com');
    });

    it('treats a whitespace-only subject as absent', () => {
        // An empty sub claim is rejected by Google outright, so it must not be
        // sent at all rather than sent blank.
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'bot@project.iam.gserviceaccount.com';
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = 'key';
        process.env.GOOGLE_IMPERSONATE_SUBJECT = '   ';

        expect(getGoogleCredentials()?.subject).toBeNull();
    });

    it('unescapes newlines in the private key', () => {
        // Env vars cannot hold real newlines in most hosts, so the PEM arrives
        // with literal backslash-n and would fail to parse untouched.
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'bot@project.iam.gserviceaccount.com';
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY =
            '-----BEGIN PRIVATE KEY-----\\nLINE1\\nLINE2\\n-----END PRIVATE KEY-----';
        process.env.GOOGLE_IMPERSONATE_SUBJECT = 'cleargo-bot@clearcompany.com';

        const creds = getGoogleCredentials();
        expect(creds?.privateKey).toContain('\n');
        expect(creds?.privateKey).not.toContain('\\n');
        expect(creds?.privateKey.split('\n')).toHaveLength(4);
    });
});

describe('GOOGLE_SCOPES', () => {
    it('requests full drive, not drive.file', () => {
        // drive.file only grants access to files the app created, so it cannot
        // read the templates the doc factory must copy.
        expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/drive');
        expect(GOOGLE_SCOPES.join(' ')).not.toContain('drive.file');
    });

    it('requests the documents scope, needed for batchUpdate', () => {
        expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/documents');
    });
});
