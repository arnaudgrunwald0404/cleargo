import { describe, it, expect, jest } from '@jest/globals';
import { findEnvNameNearMisses, reportEnvNameNearMisses } from '@/lib/env/near-miss';
import { KNOWN_ENV_VARS } from '@/lib/env/known-env-vars';

describe('findEnvNameNearMisses', () => {
    /** The typo that motivated this check. */
    it('catches an extra token on a real name', () => {
        expect(findEnvNameNearMisses(['GOOGLE_GEMINI_API_KEY'])).toEqual([
            { present: 'GOOGLE_GEMINI_API_KEY', expected: 'GEMINI_API_KEY' },
        ]);
    });

    it('catches a missing token', () => {
        expect(findEnvNameNearMisses(['ARTIFACT_DRAFT_SECRET'])).toEqual([
            { present: 'ARTIFACT_DRAFT_SECRET', expected: 'NETLIFY_ARTIFACT_DRAFT_SECRET' },
        ]);
    });

    it('says nothing about a name the code actually reads', () => {
        expect(findEnvNameNearMisses(['GEMINI_API_KEY', 'CLAUDE_API_KEY'])).toEqual([]);
    });

    /**
     * Every real variable must stay silent when the whole registry is present,
     * or the warning becomes noise people filter out. This is the property that
     * matters most -- more than catching any individual typo.
     */
    it('is silent on the entire known set', () => {
        expect(findEnvNameNearMisses(KNOWN_ENV_VARS)).toEqual([]);
    });

    it('ignores ambient system variables', () => {
        const ambient = [
            'PATH',
            'HOME',
            'SHELL',
            'TERM',
            'USERPROFILE',
            'PROCESSOR_ARCHITECTURE',
            'npm_package_name',
            'GOOGLE_APPLICATION_CREDENTIALS',
            'AWS_SECRET_ACCESS_KEY',
        ];
        expect(findEnvNameNearMisses(ambient)).toEqual([]);
    });

    it('needs two shared tokens, so a lone API/KEY match is not enough', () => {
        // Shares only KEY with everything; must not match.
        expect(findEnvNameNearMisses(['SOME_UNRELATED_KEY'])).toEqual([]);
    });

    it('does not flag a name that is two or more tokens away', () => {
        expect(findEnvNameNearMisses(['GOOGLE_GEMINI_SECRET_API_KEY'])).toEqual([]);
    });

    it('reports the closest candidate when several are near', () => {
        const known = ['FOO_API_KEY', 'FOO_BAR_API_KEY'];
        expect(findEnvNameNearMisses(['FOO_BAR_BAZ_API_KEY'], known)).toEqual([
            { present: 'FOO_BAR_BAZ_API_KEY', expected: 'FOO_BAR_API_KEY' },
        ]);
    });

    it('handles an empty or punctuation-only name without throwing', () => {
        expect(findEnvNameNearMisses(['', '___'])).toEqual([]);
    });
});

describe('reportEnvNameNearMisses', () => {
    it('logs one line per miss and names both variables', () => {
        const log = jest.fn<(message: string) => void>();
        const misses = reportEnvNameNearMisses({ GOOGLE_GEMINI_API_KEY: 'x' }, log);

        expect(misses).toHaveLength(1);
        expect(log).toHaveBeenCalledTimes(1);
        const message = log.mock.calls[0][0];
        expect(message).toContain('GOOGLE_GEMINI_API_KEY');
        expect(message).toContain('GEMINI_API_KEY');
    });

    it('stays quiet when nothing is suspicious', () => {
        const log = jest.fn<(message: string) => void>();
        expect(reportEnvNameNearMisses({ GEMINI_API_KEY: 'x', PATH: '/usr/bin' }, log)).toEqual([]);
        expect(log).not.toHaveBeenCalled();
    });
});
