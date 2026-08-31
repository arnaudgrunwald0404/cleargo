/**
 * The handoff predicate, tested because getting it wrong is invisible locally.
 *
 * A false positive means a route dispatches to a function that is not there; a
 * false negative means ensureLaunchArtifacts runs inline against a 26s cap in
 * production and nowhere else. Both are production-only failures, which is
 * exactly the class of bug this helper exists to prevent.
 */
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';
import { launchArtifactSetupTarget, dispatchLaunchArtifactSetup } from '../backgroundSetup';

const ENV_KEYS = [
    'NETLIFY_URL',
    'URL',
    'NETLIFY_ARTIFACT_DRAFT_SECRET',
    'NETLIFY_HEART_SETUP_SECRET',
] as const;

const original = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
    for (const key of ENV_KEYS) {
        const value = values[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

afterAll(() => {
    for (const key of ENV_KEYS) {
        if (original[key] === undefined) delete process.env[key];
        else process.env[key] = original[key]!;
    }
});

describe('launchArtifactSetupTarget', () => {
    it('returns the Netlify target when a URL and a secret are present', () => {
        setEnv({ NETLIFY_URL: 'https://cleargo.netlify.app', NETLIFY_ARTIFACT_DRAFT_SECRET: 's3cret' });

        expect(launchArtifactSetupTarget()).toEqual({
            baseUrl: 'https://cleargo.netlify.app',
            secret: 's3cret',
        });
    });

    it('strips a trailing slash so the function path is not doubled', () => {
        setEnv({ URL: 'https://cleargo.netlify.app/', NETLIFY_HEART_SETUP_SECRET: 's3cret' });

        expect(launchArtifactSetupTarget()?.baseUrl).toBe('https://cleargo.netlify.app');
    });

    /** There is no 26s cap in front of `next dev`, so inline is correct there. */
    it('runs inline on localhost', () => {
        setEnv({ NETLIFY_URL: 'http://localhost:3000', NETLIFY_ARTIFACT_DRAFT_SECRET: 's3cret' });

        expect(launchArtifactSetupTarget()).toBeNull();
    });

    it('runs inline with no base URL', () => {
        setEnv({ NETLIFY_ARTIFACT_DRAFT_SECRET: 's3cret' });

        expect(launchArtifactSetupTarget()).toBeNull();
    });

    /**
     * Without the secret the function would answer 401, so dispatching would
     * silently create no documents at all. Inline is the safe read.
     */
    it('runs inline with no secret', () => {
        setEnv({ NETLIFY_URL: 'https://cleargo.netlify.app' });

        expect(launchArtifactSetupTarget()).toBeNull();
    });

    it('falls back to the HEART setup secret', () => {
        setEnv({ NETLIFY_URL: 'https://cleargo.netlify.app', NETLIFY_HEART_SETUP_SECRET: 'shared' });

        expect(launchArtifactSetupTarget()?.secret).toBe('shared');
    });
});

describe('dispatchLaunchArtifactSetup', () => {
    const target = { baseUrl: 'https://cleargo.netlify.app', secret: 's3cret' };
    const fetchMock = jest.fn<typeof fetch>();

    beforeEach(() => {
        fetchMock.mockReset();
        global.fetch = fetchMock as unknown as typeof fetch;
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('posts the launch id and secret to the background function', async () => {
        fetchMock.mockResolvedValue(new Response('{}', { status: 202 }));

        expect(await dispatchLaunchArtifactSetup('launch-1', target)).toBe(true);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(
            'https://cleargo.netlify.app/.netlify/functions/launch-artifacts-background'
        );
        expect(JSON.parse(String(init?.body))).toEqual({
            launchId: 'launch-1',
            secret: 's3cret',
        });
    });

    /** Non-throwing on purpose: the caller must still return its 201. */
    it('reports false rather than throwing when the trigger errors', async () => {
        fetchMock.mockRejectedValue(new Error('network down'));

        expect(await dispatchLaunchArtifactSetup('launch-1', target)).toBe(false);
    });

    it('reports false on a non-2xx from the function', async () => {
        fetchMock.mockResolvedValue(new Response('nope', { status: 401 }));

        expect(await dispatchLaunchArtifactSetup('launch-1', target)).toBe(false);
    });
});
