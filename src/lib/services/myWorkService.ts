/**
 * One answer to "what does this person owe".
 *
 * Six surfaces asked that question independently and disagreed with each other
 * on all three axes: who owns an item, which statuses count as still-owed, and
 * whether archived / cancelled / shipped epics are excluded. A PM owning items
 * only through the pod->PM mapping saw them on My Items and got no nudges. A
 * shipped epic stayed on My Items forever. Fixing one surface never reached the
 * others, so the same class of bug kept being rediscovered.
 *
 * Two deliberate design calls:
 *
 * 1. The epic side goes through the `my_items_for_user` RPC rather than
 *    reimplementing ownership in TypeScript. The three-tier resolution
 *    (decision_owner_id -> criterion.decision_owner_email -> the app_settings
 *    pod->PM mapping) is real logic that lives in SQL, and porting it would
 *    create a seventh implementation of exactly the thing this module exists to
 *    collapse. What the RPC cannot do is exclude cancelled and shipped epics --
 *    release status is derived and needs retros plus the release schedule -- so
 *    that is layered on here via epicLifecycle.
 *
 * 2. `owed` and `blocked` are separate fields, not one list. The nudge jobs
 *    treat NO_GO as complete (a decision was made); 1:1 prep treats NO_GO as
 *    the thing to escalate. Both are right about different questions, and
 *    forcing them into one set would break whichever caller lost. Callers pick.
 *
 * Out of scope, on purpose: whether an owed item should be NUDGED today. The
 * overdue back-off, conditional confirmation windows, cleargo_candidate and the
 * synthetic missing-metrics rows are delivery policy and stay in the jobs.
 */
import { createAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeStatus } from '@/lib/readiness-scoring';
import {
    classifyEpic,
    loadEpicLifecycleContext,
    type LifecycleEpicRow,
} from '@/lib/services/epicLifecycle';
import {
    loadLaunchHomeWork,
    loadHomeBriefs,
    type LaunchHomeWork,
} from '@/lib/services/launchHomeService';
import type { HomeArtifact, HomeBrief, UnassignedGroup } from '@/lib/slack/templates/launch-home';
import { computeReleaseAwareDueDates } from '@/lib/services/derivedCriterionDueDates';

/** Shape the `my_items_for_user` RPC returns. */
export interface MyItemRow {
    id: string;
    status: string | null;
    condition: string | null;
    condition_due_date: string | null;
    last_updated_at: string | null;
    launch?: {
        id?: string;
        name?: string;
        target_launch_date?: string | null;
        tier?: string | null;
        pod?: string | null;
    } | null;
    criterion?: {
        label?: string;
        category?: string | null;
        gate?: boolean;
        sort_order?: number | null;
        rating_timing?: unknown;
        data_sources?: unknown;
    } | null;
}

export interface OwedCriterion {
    /** epic_criterion_status.id */
    id: string;
    epicId: string;
    epicName: string;
    label: string;
    category: string | null;
    gate: boolean;
    /** Raw stored value, for display parity with the surfaces that show it. */
    status: string | null;
    conditionDueDate: string | null;
    lastUpdatedAt: string | null;
    tier: string | null;
    targetLaunchDate: string | null;
    /** True when the epic has shipped - the item survives, but it is post-launch. */
    postLaunch: boolean;
    /**
     * Stage-derived deadline, present only when the caller asked for it via
     * `includeDerivedDueDates`. Undefined means "not computed", null means
     * "computed and this item has no deadline" -- the two are not the same and
     * callers rendering an overdue count need to tell them apart.
     */
    dueDate?: string | null;
    /** The full RPC row, so callers keep fields this type does not name. */
    raw: MyItemRow;
}

export interface MyWork {
    /** Awaiting this person's decision. */
    owed: OwedCriterion[];
    /** Decided, and the decision stops the launch. A different question. */
    blocked: OwedCriterion[];
    /** GTM artifacts assigned to this person. */
    launchArtifacts: HomeArtifact[];
    /** GTM rows on their launches that nobody owns - an assignment gap. */
    unassignedLaunchWork: UnassignedGroup[];
    /** Story Brief questions still waiting on them. */
    storyBriefs: HomeBrief[];
    /**
     * Per-source failure, so a caller can say "GTM section unavailable" rather
     * than silently showing zero. The Slack home tab already degraded this way;
     * this makes it part of the contract instead of each caller's problem.
     */
    degraded: Partial<Record<'release' | 'launch' | 'briefs' | 'dueDates', string>>;
}

export interface GetMyWorkOptions {
    supabase?: SupabaseClient;
    /** Skip the GTM half when a caller only speaks releases. */
    includeLaunchSide?: boolean;
    /** Skip the Story Brief query. */
    includeStoryBriefs?: boolean;
    /**
     * Attach the release-schedule-derived due date to owed/blocked items.
     *
     * Off by default because it costs three extra queries and the Slack home tab
     * does not render deadlines. `condition_due_date` alone is not a substitute:
     * it only exists once someone has recorded a Conditional Go condition, so
     * relying on it makes most items look undated.
     */
    includeDerivedDueDates?: boolean;
    today?: string;
}

/** Owed: nobody has answered yet. */
export function isOwedStatus(status: string | null): boolean {
    return normalizeStatus(status) === 'NOT_SET';
}

/** Blocked: answered, and the answer holds the launch. */
export function isBlockedStatus(status: string | null): boolean {
    const s = normalizeStatus(status);
    return s === 'NO_GO' || s === 'CONDITIONAL_GO';
}

/**
 * "Success Defined" is the one criterion still worth chasing after launch --
 * post-launch metrics genuinely do get filled in late. Everything else is
 * settled by the time an epic ships. Same rule criteria-nudges applies.
 */
export function survivesRelease(row: Pick<MyItemRow, 'criterion'>): boolean {
    return (row.criterion?.label ?? '').toLowerCase().includes('success defined');
}

function toOwedCriterion(row: MyItemRow, postLaunch: boolean): OwedCriterion {
    return {
        id: row.id,
        epicId: row.launch?.id ?? '',
        epicName: row.launch?.name ?? '',
        label: row.criterion?.label ?? '',
        category: row.criterion?.category ?? null,
        gate: row.criterion?.gate === true,
        status: row.status,
        conditionDueDate: row.condition_due_date,
        lastUpdatedAt: row.last_updated_at,
        tier: row.launch?.tier ?? null,
        targetLaunchDate: row.launch?.target_launch_date ?? null,
        postLaunch,
        raw: row,
    };
}

async function loadReleaseSide(
    email: string,
    supabase: SupabaseClient
): Promise<{ owed: OwedCriterion[]; blocked: OwedCriterion[] }> {
    // p_show_all, because the RPC's own pending filter is narrower than what is
    // needed here: it drops NO_GO, which is exactly the `blocked` set. Ask for
    // everything and split it below.
    const { data, error } = await supabase.rpc('my_items_for_user', {
        p_email: email,
        p_show_all: true,
    });
    if (error) throw error;

    const rows = (data ?? []) as MyItemRow[];
    if (rows.length === 0) return { owed: [], blocked: [] };

    const epicIds = [...new Set(rows.map((r) => r.launch?.id).filter(Boolean))] as string[];

    // The RPC already excludes archived epics but cannot exclude cancelled or
    // shipped ones: release status is derived from dates plus retro completion,
    // which needs columns the RPC does not return.
    const { data: epicRows } = await supabase
        .from('epic')
        .select('id, status, archived, target_launch_date, scheduled_ga_dev_date, aha_fields')
        .in('id', epicIds);

    const epicsById = new Map<string, LifecycleEpicRow>(
        ((epicRows ?? []) as LifecycleEpicRow[]).map((e) => [e.id, e])
    );
    const lifecycle = await loadEpicLifecycleContext(epicIds, supabase);

    const owed: OwedCriterion[] = [];
    const blocked: OwedCriterion[] = [];

    for (const row of rows) {
        const epicId = row.launch?.id;
        if (!epicId) continue;

        const epic = epicsById.get(epicId);
        // An epic we could not read is kept rather than silently dropped: the
        // RPC already vouched for it, and hiding real work is worse than
        // showing an item whose lifecycle could not be confirmed.
        const state = epic ? classifyEpic(epic, lifecycle) : null;

        if (state?.excluded) continue;
        const postLaunch = state?.released === true;
        if (postLaunch && !survivesRelease(row)) continue;

        if (isOwedStatus(row.status)) owed.push(toOwedCriterion(row, postLaunch));
        else if (isBlockedStatus(row.status)) blocked.push(toOwedCriterion(row, postLaunch));
    }

    return { owed, blocked };
}

/**
 * Everything one person owes, across releases and GTM launches.
 *
 * Each source loads independently and a failure degrades that section rather
 * than the whole answer. The Slack home tab is the reason: a launch-table error
 * should not blank the release list.
 */
export async function getMyWork(email: string, opts: GetMyWorkOptions = {}): Promise<MyWork> {
    const supabase = opts.supabase ?? createAdminClient();
    const includeLaunchSide = opts.includeLaunchSide ?? true;
    const includeStoryBriefs = opts.includeStoryBriefs ?? true;
    const today = opts.today ?? new Date().toISOString().slice(0, 10);

    const result: MyWork = {
        owed: [],
        blocked: [],
        launchArtifacts: [],
        unassignedLaunchWork: [],
        storyBriefs: [],
        degraded: {},
    };

    const [release, launch, briefs] = await Promise.allSettled([
        loadReleaseSide(email, supabase),
        includeLaunchSide
            ? loadLaunchHomeWork(email, supabase, today)
            : Promise.resolve({ artifacts: [], unassigned: [] } as LaunchHomeWork),
        includeStoryBriefs ? loadHomeBriefs(email, supabase) : Promise.resolve([] as HomeBrief[]),
    ]);

    // Supabase rejects with a plain `{ message, code, details }` object, not an
    // Error, so an `instanceof Error` check alone renders the most common
    // failure as "[object Object]" and throws away the only useful part.
    const reasonOf = (r: PromiseRejectedResult): string => {
        const reason: unknown = r.reason;
        if (reason instanceof Error) return reason.message;
        if (reason && typeof reason === 'object' && 'message' in reason) {
            return String((reason as { message: unknown }).message);
        }
        return String(reason);
    };

    if (release.status === 'fulfilled') {
        result.owed = release.value.owed;
        result.blocked = release.value.blocked;
    } else {
        result.degraded.release = reasonOf(release);
    }

    if (launch.status === 'fulfilled') {
        result.launchArtifacts = launch.value.artifacts;
        result.unassignedLaunchWork = launch.value.unassigned;
    } else {
        result.degraded.launch = reasonOf(launch);
    }

    if (briefs.status === 'fulfilled') {
        result.storyBriefs = briefs.value;
    } else {
        result.degraded.briefs = reasonOf(briefs);
    }

    if (opts.includeDerivedDueDates) {
        // Degrades like the sections above rather than failing the whole answer:
        // knowing what you owe without the deadline still beats an error.
        try {
            await attachDueDates([...result.owed, ...result.blocked], supabase);
        } catch (err) {
            result.degraded.dueDates =
                err instanceof Error ? err.message : String(err);
        }
    }

    return result;
}

/** Mutates in place -- owed and blocked hold the same object references. */
async function attachDueDates(items: OwedCriterion[], supabase: SupabaseClient): Promise<void> {
    if (items.length === 0) return;

    const dueById = await computeReleaseAwareDueDates(
        supabase,
        items.map((item) => ({
            id: item.id,
            epicId: item.epicId,
            conditionDueDate: item.conditionDueDate,
            ratingTiming: (item.raw.criterion?.rating_timing ?? null) as number | string | null,
            isGate: item.gate,
        }))
    );

    for (const item of items) {
        item.dueDate = dueById.get(item.id) ?? null;
    }
}
