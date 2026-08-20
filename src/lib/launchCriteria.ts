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

/**
 * criterion.gate is a boolean column, but the admin UI has always round-tripped
 * 'hard'/'soft' strings. Passing those through fails the write with 22P02
 * (invalid input syntax for type boolean), so coerce at the API boundary.
 */
export function normalizeGate(input: unknown): boolean {
    if (typeof input === 'boolean') return input;
    if (typeof input === 'string') {
        const v = input.trim().toLowerCase();
        return v === 'hard' || v === 'true' || v === 't' || v === '1' || v === 'yes';
    }
    return false;
}

/**
 * criterion.tier_applicability is text -- 'ALL' or a comma-separated tier list --
 * but the admin UI sends an array. Normalise both shapes to the stored form.
 */
export function normalizeTierApplicability(input: unknown): string {
    if (Array.isArray(input)) {
        const tiers = input
            .map((t) => String(t).trim().toUpperCase())
            .filter((t) => (OFFSET_TIER_KEYS as readonly string[]).includes(t));
        return tiers.length > 0 ? tiers.join(',') : 'ALL';
    }
    if (typeof input === 'string') {
        const v = input.trim();
        return v === '' ? 'ALL' : v.toUpperCase();
    }
    return 'ALL';
}

/** T-minus date resolved against the launch tier. This is the artifact's START. */
export function tierAwareDueDate(
    targetLaunchDate: string | null | undefined,
    criterion: CriterionSchedule,
    launchTier: string | null | undefined
): string | null {
    return tMinusDueDate(targetLaunchDate, resolveOffsetDays(criterion, launchTier));
}

/** A criterion as a node in the artifact runway. */
export interface CriterionScheduleNode extends CriterionSchedule {
    id: string;
    tier_applicability?: string | null;
    depends_on_criterion_id?: string | null;
}

/**
 * Kristin's workback numbers are where each artifact must START, counted back
 * from the release. A criterion, though, records a completion ("delivered",
 * "ratified"), so its due date is the moment its successor has to begin —
 * Story Brief is due when the Message Brief starts.
 *
 * A criterion with no successor keeps its own offset as the due date. That
 * covers both the tail of the runway and all 51 pre-workback criteria, whose
 * behaviour is therefore completely unchanged.
 */
export function runwayDueOffsetDays(
    criterion: CriterionScheduleNode,
    all: CriterionScheduleNode[],
    launchTier: string | null | undefined
): number | null {
    const own = resolveOffsetDays(criterion, launchTier);
    const successor = all.find(
        (c) =>
            c.depends_on_criterion_id === criterion.id &&
            c.id !== criterion.id &&
            launchCriterionApplies(c.tier_applicability, launchTier)
    );
    if (!successor) return own;
    const successorStart = resolveOffsetDays(successor, launchTier);
    return successorStart ?? own;
}

/** Due date for a criterion, derived from where its successor starts. */
export function runwayDueDate(
    targetLaunchDate: string | null | undefined,
    criterion: CriterionScheduleNode,
    all: CriterionScheduleNode[],
    launchTier: string | null | undefined
): string | null {
    return tMinusDueDate(targetLaunchDate, runwayDueOffsetDays(criterion, all, launchTier));
}

export type ScheduleState =
    | 'no_date'
    /** Release landed closer than the runway needs — the window never existed. */
    | 'compressed'
    | 'upcoming'
    | 'in_window'
    | 'late';

/**
 * Kristin: "when a release date is closer than the T1 runway (as happened with
 * 2026.8), the system should show the sequence as compressed/started rather than
 * flagging an error — the artifact predates the window, it isn't missing."
 *
 * The test for that is whether the artifact was supposed to start before the
 * launch record even existed. If so the runway never fit, and calling it late
 * blames the team for arithmetic.
 */
export function scheduleState(args: {
    startDate: string | null;
    dueDate: string | null;
    today: string;
    launchCreatedAt?: string | null;
}): ScheduleState {
    const { startDate, dueDate, today, launchCreatedAt } = args;
    if (!startDate && !dueDate) return 'no_date';

    if (startDate && launchCreatedAt) {
        const createdDay = launchCreatedAt.slice(0, 10);
        if (startDate < createdDay) return 'compressed';
    }
    if (startDate && today < startDate) return 'upcoming';
    if (dueDate && today > dueDate) return 'late';
    return 'in_window';
}
