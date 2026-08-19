/**
 * Launch checklist helpers shared by the /api/launches routes.
 */

/**
 * Launch-context criteria use 'ALL' or a comma-separated tier list
 * (e.g. 'TIER_1,TIER_2') for tier_applicability. A launch with no tier
 * gets the full battery — there is nothing to filter on until tier is set.
 */
export function launchCriterionApplies(
    tierApplicability: string | null | undefined,
    launchTier: string | null | undefined
): boolean {
    if (!tierApplicability || tierApplicability === 'ALL') return true;
    if (!launchTier) return true;
    return tierApplicability
        .split(',')
        .map((t) => t.trim())
        .includes(launchTier);
}

/** T-minus due date: target launch date minus offset days, as YYYY-MM-DD. */
export function tMinusDueDate(
    targetLaunchDate: string | null | undefined,
    offsetDays: number | null | undefined
): string | null {
    if (!targetLaunchDate || offsetDays == null) return null;
    const d = new Date(`${targetLaunchDate}T00:00:00Z`);
    if (isNaN(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() - offsetDays);
    return d.toISOString().split('T')[0];
}

/**
 * Placeholder owner meaning "whoever owns this launch" — resolved to the
 * launch's own owner_email at instantiation. Kristin's artifact ownership is
 * "PM for the Story Brief, PMM for everything downstream", and the PMM in
 * question is always the launch owner, so the template stores intent rather
 * than a hard-coded person who would go stale.
 */
export const LAUNCH_OWNER_PLACEHOLDER = '[launch owner (PMM)]';

/**
 * Resolve a criterion template's default owner against the launch.
 * Returns null rather than leaking a placeholder string into an email column.
 */
export function resolveCriterionOwner(
    defaultOwnerEmail: string | null | undefined,
    launchOwnerEmail: string | null | undefined
): string | null {
    if (!defaultOwnerEmail) return null;
    if (defaultOwnerEmail === LAUNCH_OWNER_PLACEHOLDER) return launchOwnerEmail || null;
    // Any other bracketed placeholder (e.g. the pod-PM one) is intent, not an
    // address — a launch bundles epics across pods, so it has no single PM.
    if (defaultOwnerEmail.startsWith('[')) return null;
    return defaultOwnerEmail;
}

/** The scheduling fields a criterion contributes to its own due date. */
export interface CriterionSchedule {
    default_due_offset_days?: number | null;
    tier_offset_days?: Record<string, number> | null;
}

/**
 * Lead time scales with tier: the GTM workback gives Tier 1 ~8 weeks and
 * Tier 2 ~5 weeks for the same artifact chain, so one scalar offset cannot
 * serve both. tier_offset_days carries the per-tier value; default_due_offset_days
 * stays the fallback, which is what every pre-workback criterion still uses.
 */
export function resolveOffsetDays(
    criterion: CriterionSchedule,
    launchTier: string | null | undefined
): number | null {
    const perTier = criterion.tier_offset_days;
    if (launchTier && perTier && typeof perTier === 'object') {
        const value = perTier[launchTier];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return criterion.default_due_offset_days ?? null;
}

/**
 * Tiers a per-tier offset may be keyed by. Launches are only ever T1/T2
 * (see src/types/launches.ts), but TIER_3 is accepted so the epic-level
 * release-note motion from the GTM workback has somewhere to live.
 */
export const OFFSET_TIER_KEYS = ['TIER_1', 'TIER_2', 'TIER_3'] as const;

/**
 * Sanitize admin-supplied tier offsets before they reach a jsonb column:
 * keep only known tier keys with finite integer day counts, and collapse an
 * empty result to null so "no per-tier override" stays a single representation.
 */
export function normalizeTierOffsets(input: unknown): Record<string, number> | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const source = input as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const tier of OFFSET_TIER_KEYS) {
        const raw = source[tier];
        if (raw === null || raw === undefined || raw === '') continue;
        const value = typeof raw === 'string' ? Number(raw) : raw;
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        out[tier] = Math.trunc(value);
    }
    return Object.keys(out).length > 0 ? out : null;
}

/** T-minus due date resolved against the launch tier. */
export function tierAwareDueDate(
    targetLaunchDate: string | null | undefined,
    criterion: CriterionSchedule,
    launchTier: string | null | undefined
): string | null {
    return tMinusDueDate(targetLaunchDate, resolveOffsetDays(criterion, launchTier));
}
