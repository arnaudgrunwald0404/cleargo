/**
 * Catching a misspelled environment variable at startup instead of never.
 *
 * WHY THIS EXISTS: a variable set under the wrong name is completely silent.
 * The code reads the real name, finds nothing, and the feature behaves exactly
 * as though nobody had configured it -- so the symptom shows up much later and
 * looks like anything except a typo. `GOOGLE_GEMINI_API_KEY` instead of
 * `GEMINI_API_KEY` cost a debugging cycle for precisely that reason.
 *
 * The check is deliberately narrow. It reports only names that share at least
 * two tokens with a known variable AND differ from it by at most one token,
 * which is the shape of a real typo (`GOOGLE_` prefixed onto a name that does
 * not take it, `_ID` where the code wants `_KEY`). Anything looser starts
 * flagging unrelated ambient variables, and a check people learn to ignore is
 * worse than no check.
 */
import { KNOWN_ENV_VARS } from './known-env-vars';

export interface EnvNameNearMiss {
    /** The name that is actually set. */
    present: string;
    /** The name the code reads. */
    expected: string;
}

/** `GOOGLE_GEMINI_API_KEY` -> ['GOOGLE', 'GEMINI', 'API', 'KEY'] */
function tokenize(name: string): string[] {
    return name
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter(Boolean);
}

/**
 * Names that are set but look like a misspelling of one the code reads.
 *
 * Pure and order-stable so it can be tested without touching process.env.
 */
export function findEnvNameNearMisses(
    presentNames: Iterable<string>,
    knownNames: readonly string[] = KNOWN_ENV_VARS
): EnvNameNearMiss[] {
    const known = new Set(knownNames);
    const knownTokens = knownNames.map((name) => ({ name, tokens: new Set(tokenize(name)) }));

    const misses: EnvNameNearMiss[] = [];

    for (const present of presentNames) {
        // A name the code actually reads is correct by definition, whatever it
        // resembles. This is what keeps legitimate pairs quiet -- e.g.
        // GOOGLE_CALENDAR_CLIENT_ID vs GOOGLE_OAUTH_CLIENT_ID.
        if (known.has(present)) continue;

        const presentTokens = new Set(tokenize(present));
        if (presentTokens.size === 0) continue;

        let best: { name: string; distance: number } | null = null;

        for (const candidate of knownTokens) {
            let shared = 0;
            for (const token of presentTokens) if (candidate.tokens.has(token)) shared += 1;

            // Two shared tokens is the floor. Below it, "API" or "KEY" alone
            // would match half the environment.
            if (shared < 2) continue;

            const extra = presentTokens.size - shared;
            const missing = candidate.tokens.size - shared;
            const distance = extra + missing;
            if (distance === 0 || distance > 1) continue;

            if (!best || distance < best.distance) {
                best = { name: candidate.name, distance };
            }
        }

        if (best) misses.push({ present, expected: best.name });
    }

    return misses;
}

/**
 * Log any near-misses once. Returns what it found so callers can assert on it.
 *
 * Warns rather than throws: a typo in an optional integration key should not
 * stop the server, and this check is a heuristic -- it must never be able to
 * take the app down on a false positive.
 */
export function reportEnvNameNearMisses(
    env: Record<string, string | undefined> = process.env,
    log: (message: string) => void = console.warn
): EnvNameNearMiss[] {
    const misses = findEnvNameNearMisses(Object.keys(env));

    for (const miss of misses) {
        log(
            `[env] ${miss.present} is set but nothing reads it. ` +
                `Did you mean ${miss.expected}? Nothing will use ${miss.present}.`
        );
    }

    return misses;
}
