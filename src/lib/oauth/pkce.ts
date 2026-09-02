/**
 * PKCE verification (RFC 7636), S256 only.
 *
 * OAuth 2.1 and the MCP spec both require PKCE, and `plain` is not accepted --
 * it offers no protection against an intercepted authorization code, which is
 * the entire threat PKCE exists for. The authorize endpoint refuses a request
 * without an S256 challenge rather than downgrading.
 */
import { createHash, timingSafeEqual } from 'crypto';

/** S256: BASE64URL(SHA256(ASCII(verifier))). */
export function deriveChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Does this verifier match the challenge recorded at authorize time?
 *
 * Compared with timingSafeEqual. The margin an attacker gains from a byte-by-byte
 * comparison here is thin, but the cost of doing it properly is one function call.
 */
export function verifyChallenge(verifier: string, challenge: string): boolean {
    if (!verifier || !challenge) return false;

    // RFC 7636 s4.1: 43-128 characters of unreserved ASCII.
    if (verifier.length < 43 || verifier.length > 128) return false;
    if (!/^[A-Za-z0-9\-._~]+$/.test(verifier)) return false;

    const derived = Buffer.from(deriveChallenge(verifier));
    const expected = Buffer.from(challenge);

    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
}
