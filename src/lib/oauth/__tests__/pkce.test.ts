/**
 * PKCE is the only thing protecting the authorization code, because the clients
 * here are public and hold no secret. If verifyChallenge can be made to return
 * true for a verifier that does not match, an intercepted code becomes a working
 * token — so the negative cases matter more than the positive one.
 */
import { describe, it, expect } from '@jest/globals';
import { deriveChallenge, verifyChallenge } from '../pkce';

/** 43 chars is the RFC 7636 minimum; this is a realistic client verifier. */
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

describe('deriveChallenge', () => {
    it('produces the S256 challenge from RFC 7636 appendix B', () => {
        expect(deriveChallenge(VERIFIER)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    });
});

describe('verifyChallenge', () => {
    it('accepts the verifier that produced the challenge', () => {
        expect(verifyChallenge(VERIFIER, deriveChallenge(VERIFIER))).toBe(true);
    });

    it('rejects a different verifier', () => {
        const other = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstwXXX';
        expect(verifyChallenge(other, deriveChallenge(VERIFIER))).toBe(false);
    });

    it('rejects a plain verifier passed as its own challenge', () => {
        // The `plain` method is not supported. A client that sends the verifier
        // as the challenge must not authenticate.
        expect(verifyChallenge(VERIFIER, VERIFIER)).toBe(false);
    });

    it('rejects an empty verifier or challenge', () => {
        expect(verifyChallenge('', deriveChallenge(VERIFIER))).toBe(false);
        expect(verifyChallenge(VERIFIER, '')).toBe(false);
    });

    it('rejects a verifier shorter than the 43-character minimum', () => {
        const short = 'tooshort';
        expect(verifyChallenge(short, deriveChallenge(short))).toBe(false);
    });

    it('rejects a verifier longer than the 128-character maximum', () => {
        const long = 'a'.repeat(129);
        expect(verifyChallenge(long, deriveChallenge(long))).toBe(false);
    });

    it('rejects characters outside the unreserved set', () => {
        const illegal = 'a'.repeat(42) + '/';
        expect(verifyChallenge(illegal, deriveChallenge(illegal))).toBe(false);
    });
});
