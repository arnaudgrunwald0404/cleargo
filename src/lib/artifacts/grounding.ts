/**
 * Anti-hallucination pass, generalised across all five artifacts.
 *
 * Ported from src/lib/story-brief/generator.ts, where it works but hardcodes
 * the three Story Brief sections that carry claims. Here the sections are
 * declared per artifact in the registry and walked generically, so a Campaign
 * Brief gets the same discipline a Story Brief does.
 *
 * This is a heuristic net, not a proof — free-text claims cannot be verified
 * with certainty. Human review remains the real control. What it buys is that
 * an ungrounded claim becomes a QUESTION rather than an assertion, which is the
 * entire difference between a useful draft and a dangerous one.
 */

export interface GroundableClaim {
    text: string;
    source: string;
    grounded: boolean;
}

export interface GroundableSection {
    claims: GroundableClaim[];
    open_flags: string[];
}

/**
 * Unearned marketing language. The Agent-launch retro that started this
 * workstream was about the field overclaiming what shipped; this list is the
 * cheapest mechanical defence against the draft seeding that.
 */
export const BANNED_PHRASES = [
    'seamless',
    'seamlessly',
    'revolutionary',
    'revolutionize',
    'game-changing',
    'game changer',
    'best-in-class',
    'best in class',
    'delight',
    'transform',
    'transformative',
    '10x',
    'industry-leading',
    'cutting-edge',
    'world-class',
];

export interface GroundingSignals {
    /** Everything the model was allowed to draw on, concatenated and lowercased. */
    referenceText: string;
    ahaAvailable: boolean;
    jiraAvailable: boolean;
    gapDetected: boolean;
}

function groundClaim(claim: GroundableClaim, referenceText: string): GroundableClaim {
    if (claim.source === 'unstated_assumption') {
        return { ...claim, grounded: false };
    }

    const lower = claim.text.toLowerCase();
    const offending = BANNED_PHRASES.find((phrase) => lower.includes(phrase));
    // A banned phrase is only disqualifying if the source material did not use
    // it first — quoting a customer who said "seamless" is legitimate.
    if (offending && !referenceText.includes(offending)) {
        return { ...claim, grounded: false };
    }
    return claim;
}

/**
 * Walk the declared claim-bearing sections of an artifact output, re-check each
 * claim, and push anything newly ungrounded into that section's open_flags.
 *
 * Mutates nothing: returns a new object with the same shape.
 */
export function postProcessGrounding<T extends Record<string, unknown>>(
    output: T,
    claimSections: readonly string[],
    signals: GroundingSignals
): T {
    const reference = signals.referenceText.toLowerCase();
    const result: Record<string, unknown> = { ...output };
    const allClaims: GroundableClaim[] = [];

    for (const key of claimSections) {
        const section = result[key];
        if (!section || typeof section !== 'object') continue;

        const typed = section as unknown as GroundableSection;
        if (!Array.isArray(typed.claims)) continue;

        const claims = typed.claims.map((c) => groundClaim(c, reference));
        // Only claims this pass newly demoted become questions — one that the
        // model already admitted was ungrounded is already in open_flags.
        const newlyUngrounded = claims
            .filter((c, i) => !c.grounded && typed.claims[i]?.grounded !== false)
            .map((c) => c.text);

        result[key] = {
            ...section,
            claims,
            open_flags: [...(typed.open_flags ?? []), ...newlyUngrounded],
        };
        allClaims.push(...claims);
    }

    result.overall_confidence = computeConfidence(allClaims, signals);
    return result as T;
}

/**
 * Recompute confidence deterministically rather than trusting the model's
 * self-report — a model asked to rate its own certainty reliably overrates it.
 */
export function computeConfidence(
    claims: GroundableClaim[],
    signals: GroundingSignals
): 'high' | 'medium' | 'low' {
    const ungroundedFraction =
        claims.length > 0 ? claims.filter((c) => !c.grounded).length / claims.length : 0;

    if (ungroundedFraction > 0.3 || (!signals.ahaAvailable && !signals.jiraAvailable)) {
        return 'low';
    }
    if (!signals.ahaAvailable || !signals.jiraAvailable || signals.gapDetected) {
        return 'medium';
    }
    return 'high';
}

/**
 * Collect every open_flag across the declared sections, tagged with which
 * section raised it. This is the raw interview queue.
 */
export function collectOpenFlags(
    output: Record<string, unknown>,
    claimSections: readonly string[]
): Array<{ section: string; claim: string }> {
    const out: Array<{ section: string; claim: string }> = [];

    for (const key of claimSections) {
        const section = output[key];
        if (!section || typeof section !== 'object') continue;
        const flags = (section as unknown as GroundableSection).open_flags;
        if (!Array.isArray(flags)) continue;
        for (const claim of flags) {
            if (typeof claim === 'string' && claim.trim()) {
                out.push({ section: key, claim: claim.trim() });
            }
        }
    }

    return out;
}
