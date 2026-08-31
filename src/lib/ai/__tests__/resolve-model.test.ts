import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { getAnthropicBaseUrl } from '@/lib/ai/resolve-model';

const ANTHROPIC_API_V1 = 'https://api.anthropic.com/v1';
const originalEnv = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.CLEARGO_ANTHROPIC_BASE_URL;
    for (const [k, v] of Object.entries(vars)) {
        if (v !== undefined) process.env[k] = v;
    }
}

describe('getAnthropicBaseUrl', () => {
    beforeEach(() => setEnv({}));
    afterAll(() => {
        process.env = { ...originalEnv };
    });

    it('defaults to the Anthropic Messages API', () => {
        expect(getAnthropicBaseUrl()).toBe(ANTHROPIC_API_V1);
    });

    /**
     * The bug this file exists for: a developer's machine-wide gateway (set for
     * an unrelated project) silently redirected every Claude call in ClearGO and
     * produced `AI_APICallError: Not Found` from https://<gateway>/messages.
     */
    it('ignores a foreign ANTHROPIC_BASE_URL', () => {
        setEnv({ ANTHROPIC_BASE_URL: 'https://clearai.clearco.tools' });
        expect(getAnthropicBaseUrl()).toBe(ANTHROPIC_API_V1);
    });

    it('ignores the Netlify site-local AI path that started this workaround', () => {
        setEnv({ ANTHROPIC_BASE_URL: 'https://cleargo.netlify.app/.netlify/ai' });
        expect(getAnthropicBaseUrl()).toBe(ANTHROPIC_API_V1);
    });

    it('honours an ambient value that points at Anthropic itself', () => {
        setEnv({ ANTHROPIC_BASE_URL: 'https://api.anthropic.com/v1' });
        expect(getAnthropicBaseUrl()).toBe(ANTHROPIC_API_V1);
    });

    it('honours an explicit ClearGO override', () => {
        setEnv({ CLEARGO_ANTHROPIC_BASE_URL: 'https://gateway.example.com/v1' });
        expect(getAnthropicBaseUrl()).toBe('https://gateway.example.com/v1');
    });

    it('lets the explicit override win over an ambient one', () => {
        setEnv({
            ANTHROPIC_BASE_URL: 'https://clearai.clearco.tools',
            CLEARGO_ANTHROPIC_BASE_URL: 'https://gateway.example.com/v1',
        });
        expect(getAnthropicBaseUrl()).toBe('https://gateway.example.com/v1');
    });

    /**
     * The SDK appends `/messages`, so a base URL without a version segment
     * resolves to `/messages` and 404s -- which is exactly the shape of the
     * original failure.
     */
    it('appends /v1 when the override omits a version', () => {
        setEnv({ CLEARGO_ANTHROPIC_BASE_URL: 'https://gateway.example.com' });
        expect(getAnthropicBaseUrl()).toBe('https://gateway.example.com/v1');
    });

    it('does not double up a version that is already there', () => {
        setEnv({ CLEARGO_ANTHROPIC_BASE_URL: 'https://gateway.example.com/v2' });
        expect(getAnthropicBaseUrl()).toBe('https://gateway.example.com/v2');
    });

    it('tolerates trailing slashes', () => {
        setEnv({ CLEARGO_ANTHROPIC_BASE_URL: 'https://gateway.example.com///' });
        expect(getAnthropicBaseUrl()).toBe('https://gateway.example.com/v1');
    });

    it('falls back rather than throwing on an unparseable value', () => {
        setEnv({ ANTHROPIC_BASE_URL: 'not a url' });
        expect(getAnthropicBaseUrl()).toBe(ANTHROPIC_API_V1);
    });
});
