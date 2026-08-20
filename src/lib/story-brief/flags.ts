/**
 * Story Brief flags: the agent's interview queue.
 *
 * A flag is something the generator wanted to assert and could not ground in
 * Aha, Jira or the PM's notes. That set is precisely the set of things only a
 * human knows, which makes it the right thing to ask about — the agent never
 * shows a blank template, it asks the three questions it already tried and
 * failed to answer.
 *
 * The hard part is identity. `open_flags` lives in the section JSON as free text
 * and `postProcessGrounding` appends to it on every regeneration, so the same
 * gap reappears as a "new" flag with slightly different wording. Without stable
 * keys, a regeneration re-asks questions that were already answered.
 */

export type FlagStatus = 'open' | 'asked' | 'answered' | 'deferred';

export interface StoryBriefFlag {
    flag_key: string;
    section: string;
    claim: string;
    question?: string | null;
    status: FlagStatus;
    answer?: string | null;
    last_seen_generation: number;
}

/** A flag as the generator emits it, before it has identity or state. */
export interface RawFlag {
    section: string;
    claim: string;
}

/**
 * Normalise claim text before hashing so trivial rewording does not mint a new
 * flag: case, surrounding punctuation, and internal whitespace all collapse.
 * Deliberately NOT stemming or dropping stopwords — two genuinely different
 * questions must not collide.
 */
export function normalizeClaim(claim: string): string {
    return claim
        .toLowerCase()
        .replace(/[\s ]+/g, ' ')
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
        .trim();
}

/**
 * Stable identity for a flag: section + normalised claim.
 *
 * A deliberately simple, dependency-free 32-bit hash rendered hex. This is a
 * dedupe key, not a security primitive — collisions would merge two questions
 * in one section, which the normalisation makes unlikely and which is far less
 * damaging than re-asking an answered question on every regeneration.
 */
export function storyBriefFlagKey(section: string, claim: string): string {
    const input = `${section}::${normalizeClaim(claim)}`;
    let hash = 2166136261; // FNV-1a offset basis
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface ReconcileResult {
    /** Flags to insert — genuinely new gaps. */
    toInsert: Array<{ flag_key: string; section: string; claim: string; last_seen_generation: number }>;
    /** Existing flags still present in this generation; bump last_seen_generation. */
    toTouch: Array<{ flag_key: string; last_seen_generation: number }>;
    /** Flags no longer produced. Kept, never deleted — see below. */
    stale: string[];
    /**
     * Already-answered flags that reappeared. The agent must NOT re-ask these;
     * they exist so a caller can surface "you answered this before" instead.
     */
    reappeared: string[];
}

/**
 * Reconcile a fresh generation's flags against what is already on record.
 *
 * Three rules, all learned from the shape of the bug this replaces:
 *
 *  - Answered stays answered. A regeneration that re-raises a settled gap must
 *    not reopen it, or every regeneration restarts the interview.
 *  - Nothing is deleted. A flag that disappears is marked stale, because the
 *    answer is still worth keeping if the gap returns.
 *  - Only genuinely new keys are inserted, so the queue reflects real progress.
 */
export function reconcileFlags(
    fresh: RawFlag[],
    existing: Array<Pick<StoryBriefFlag, 'flag_key' | 'status'>>,
    generation: number
): ReconcileResult {
    const existingByKey = new Map(existing.map((f) => [f.flag_key, f]));

    const toInsert: ReconcileResult['toInsert'] = [];
    const toTouch: ReconcileResult['toTouch'] = [];
    const reappeared: string[] = [];
    const seen = new Set<string>();

    for (const f of fresh) {
        const claim = f.claim?.trim();
        if (!claim) continue;
        const flag_key = storyBriefFlagKey(f.section, claim);
        // The same gap can be emitted twice in one generation (the section's own
        // open_flags plus postProcessGrounding's append); collapse it.
        if (seen.has(flag_key)) continue;
        seen.add(flag_key);

        const prior = existingByKey.get(flag_key);
        if (!prior) {
            toInsert.push({ flag_key, section: f.section, claim, last_seen_generation: generation });
            continue;
        }
        toTouch.push({ flag_key, last_seen_generation: generation });
        if (prior.status === 'answered' || prior.status === 'deferred') {
            reappeared.push(flag_key);
        }
    }

    const stale = existing.map((f) => f.flag_key).filter((k) => !seen.has(k));
    return { toInsert, toTouch, stale, reappeared };
}

/** Flags the agent should put to a human, in ask order. */
export function pendingFlags<T extends Pick<StoryBriefFlag, 'status'>>(flags: T[]): T[] {
    return flags.filter((f) => f.status === 'open' || f.status === 'asked');
}

/**
 * Ratification gate, mirroring the template's own rule for open decisions:
 * every flag must be answered or explicitly deferred. Distinct from the
 * open_decisions gate — that covers named commercialization decisions, this
 * covers ungrounded claims.
 */
export function flagsClearedForRatification<T extends Pick<StoryBriefFlag, 'status'>>(
    flags: T[]
): boolean {
    return flags.every((f) => f.status === 'answered' || f.status === 'deferred');
}
