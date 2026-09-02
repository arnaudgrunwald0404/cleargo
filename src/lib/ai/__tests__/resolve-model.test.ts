import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';
import type { LanguageModel } from 'ai';
import fs from 'fs';
import path from 'path';
import {
    getAnthropicBaseUrl,
    runWithModelFallback,
    shouldTryNextModel,
    DEFAULT_GEMINI_MODEL,
} from '@/lib/ai/resolve-model';

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

describe('shouldTryNextModel', () => {
    const err = (statusCode: number | undefined, message = 'boom') =>
        Object.assign(new Error(message), statusCode === undefined ? {} : { statusCode });

    it('falls back on rate limiting and quota', () => {
        expect(shouldTryNextModel(err(429))).toBe(true);
        expect(shouldTryNextModel(err(402))).toBe(true);
    });

    it('falls back on a bad or revoked key', () => {
        expect(shouldTryNextModel(err(401))).toBe(true);
        expect(shouldTryNextModel(err(403))).toBe(true);
    });

    it('falls back on server errors', () => {
        expect(shouldTryNextModel(err(500))).toBe(true);
        expect(shouldTryNextModel(err(503))).toBe(true);
    });

    /**
     * A schema the model cannot satisfy fails the same way everywhere. Retrying
     * doubles latency and hides our own bug.
     */
    it('does NOT fall back on an ordinary bad request', () => {
        expect(shouldTryNextModel(err(400, 'invalid schema'))).toBe(false);
        expect(shouldTryNextModel(err(404, 'Not Found'))).toBe(false);
    });

    /** The real error text seen when the account hit its spend cap. */
    it('falls back on a 400 that is actually about usage limits', () => {
        expect(
            shouldTryNextModel(
                err(400, 'You have reached your specified API usage limits. You will regain access on 2026-09-01')
            )
        ).toBe(true);
    });

    it('falls back on an unclassifiable error, since the next provider is a different host', () => {
        expect(shouldTryNextModel(err(undefined, 'ECONNRESET'))).toBe(true);
        expect(shouldTryNextModel(null)).toBe(true);
    });
});

describe('runWithModelFallback', () => {
    const candidate = (label: string) => ({ model: label as never, label });

    it('throws a clear error when nothing is configured', async () => {
        await expect(runWithModelFallback([], async () => 'x')).rejects.toThrow(
            /No AI model configured/
        );
    });

    it('uses the first candidate when it works', async () => {
        const op = jest.fn<(m: LanguageModel) => Promise<string>>(async (m) => `ran:${String(m)}`);
        await expect(
            runWithModelFallback([candidate('haiku'), candidate('gemini')], op)
        ).resolves.toBe('ran:haiku');
        expect(op).toHaveBeenCalledTimes(1);
    });

    it('moves to the next candidate when the first is rate limited', async () => {
        const log = jest.fn<(m: string) => void>();
        const op = jest
            .fn<(m: LanguageModel) => Promise<string>>()
            .mockRejectedValueOnce(Object.assign(new Error('limit'), { statusCode: 429 }))
            .mockResolvedValueOnce('ran:gemini');

        await expect(
            runWithModelFallback([candidate('haiku'), candidate('gemini')], op, log)
        ).resolves.toBe('ran:gemini');
        expect(op).toHaveBeenCalledTimes(2);
        expect(log.mock.calls[0][0]).toContain('haiku');
        expect(log.mock.calls[0][0]).toContain('gemini');
    });

    it('does not move on for a non-retryable failure', async () => {
        const op = jest
            .fn<(m: LanguageModel) => Promise<string>>()
            .mockRejectedValue(Object.assign(new Error('invalid schema'), { statusCode: 400 }));

        await expect(
            runWithModelFallback([candidate('haiku'), candidate('gemini')], op)
        ).rejects.toThrow('invalid schema');
        expect(op).toHaveBeenCalledTimes(1);
    });

    /** The primary failure describes the real problem; the last one buries it. */
    it('rethrows the FIRST error when every candidate fails', async () => {
        const op = jest
            .fn<(m: LanguageModel) => Promise<string>>()
            .mockRejectedValueOnce(Object.assign(new Error('anthropic quota'), { statusCode: 429 }))
            .mockRejectedValueOnce(Object.assign(new Error('gemini unavailable'), { statusCode: 503 }));

        await expect(
            runWithModelFallback([candidate('haiku'), candidate('gemini')], op, () => {})
        ).rejects.toThrow('anthropic quota');
        expect(op).toHaveBeenCalledTimes(2);
    });
});

/**
 * Google retires Gemini versions and then REFUSES them at runtime ("no longer
 * available to new users") rather than warning. Two different stale ids were
 * scattered across six files here, so retros, the weekly digest and
 * stale-criteria nudges were failing without anyone noticing.
 */
describe('model ids', () => {
    const RETIRED = /gemini-(1\.5|2\.0|2\.5)[a-z0-9.\-]*/g;

    function sourceFiles(dir: string, out: string[] = []): string[] {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
                sourceFiles(full, out);
            } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
                out.push(full);
            }
        }
        return out;
    }

    it('has no retired Gemini id anywhere in src/', () => {
        const src = path.resolve(__dirname, '../../..');
        const offenders: string[] = [];

        for (const file of sourceFiles(src)) {
            const source = fs.readFileSync(file, 'utf8');
            // Only real code -- the constant's own doc comment names the old ids
            // deliberately, to explain why they are gone.
            const withoutComments = source
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/.*$/gm, '');
            for (const match of withoutComments.matchAll(RETIRED)) {
                offenders.push(`${path.relative(src, file)}: ${match[0]}`);
            }
        }

        expect(offenders).toEqual([]);
    });

    it('points the Gemini fallback at the id Google told us to use', () => {
        expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.6-flash');
    });
});
