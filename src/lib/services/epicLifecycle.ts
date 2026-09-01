/**
 * Is this epic still live work?
 *
 * Six surfaces answer "what does this user owe" and only one of them --
 * api/jobs/criteria-nudges -- gets this part right. The rest variously miss
 * archived epics, miss cancelled ones, or approximate "released" by comparing
 * `epic.status` to values that have not existed since 20260128000327 renamed
 * them. So a shipped epic keeps appearing on My Items forever, and stale-criteria
 * nudges about epics nobody can even see.
 *
 * The reason the correct version never spread is that it needs two extra
 * queries -- retros and the release schedule -- because release status is
 * DERIVED (see epic-release-status.ts), never stored. `epic.status` holds only
 * a 'Cancelled' override. That batch load is what lives here, so every surface
 * can afford to be right.
 *
 * Scope: lifecycle only. Whether an OWED item should be nudged TODAY -- the
 * overdue back-off, conditional confirmation windows, cleargo_candidate, the
 * n/a rules -- is delivery policy and stays in the jobs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    computeEpicReleaseStatus,
    isReleasedStatus,
    type EpicForStatus,
    type EpicReleaseStatus,
    type ReleaseScheduleDateRow,
    type RetroForStatus,
} from '@/lib/epic-release-status';

/** The epic columns a lifecycle decision needs. */
export type LifecycleEpicRow = EpicForStatus & { archived?: boolean | null };

export interface EpicLifecycleContext {
    retrosByEpic: Map<string, RetroForStatus[]>;
    releaseSchedule: ReleaseScheduleDateRow[];
    /** Release name -> launch date, keyed under both raw and normalized names. */
    releaseToDate: Map<string, string | null>;
}

/**
 * Epics carry "Release 2026.2" while release_schedule stores "2026.2", and both
 * spellings occur in each. Strips repeated prefixes rather than one.
 */
export function normalizeReleaseName(name: string): string {
    if (!name) return name;
    let normalized = name.trim();
    while (normalized.toLowerCase().startsWith('release ')) {
        normalized = normalized.substring(8).trim();
    }
    return normalized;
}

/**
 * Two queries for any number of epics. Callers that already hold retros or the
 * schedule can pass them in to skip the reads.
 */
export async function loadEpicLifecycleContext(
    epicIds: string[],
    supabase: SupabaseClient,
    preloaded?: Partial<Pick<EpicLifecycleContext, 'releaseSchedule'>>
): Promise<EpicLifecycleContext> {
    const retrosByEpic = new Map<string, RetroForStatus[]>();
    const releaseToDate = new Map<string, string | null>();

    if (epicIds.length === 0) {
        return { retrosByEpic, releaseSchedule: preloaded?.releaseSchedule ?? [], releaseToDate };
    }

    const [retroResult, scheduleResult] = await Promise.all([
        supabase.from('epic_retros').select('epic_id, day_marker, status').in('epic_id', epicIds),
        preloaded?.releaseSchedule
            ? Promise.resolve({ data: preloaded.releaseSchedule })
            : supabase
                  .from('release_schedule')
                  .select('release_name, launch_date, cohort2_date')
                  .eq('archived', false),
    ]);

    for (const r of (retroResult.data ?? []) as Array<RetroForStatus & { epic_id: string }>) {
        const list = retrosByEpic.get(r.epic_id) ?? [];
        list.push({ day_marker: r.day_marker, status: r.status });
        retrosByEpic.set(r.epic_id, list);
    }

    const releaseSchedule = (scheduleResult.data ?? []) as ReleaseScheduleDateRow[];
    for (const release of releaseSchedule) {
        const raw = release.release_name;
        if (!raw) continue;
        releaseToDate.set(raw, release.launch_date ?? null);
        const normalized = normalizeReleaseName(raw);
        if (normalized !== raw) releaseToDate.set(normalized, release.launch_date ?? null);
    }

    return { retrosByEpic, releaseSchedule, releaseToDate };
}

export type LifecycleExclusion = 'archived' | 'cancelled' | null;

export interface EpicLifecycle {
    status: EpicReleaseStatus;
    /** Out of scope entirely: archived or cancelled. */
    excluded: boolean;
    exclusion: LifecycleExclusion;
    /** Shipped. Not excluded — post-launch work is still real work. */
    released: boolean;
    /** True when the epic is neither excluded nor released. */
    active: boolean;
}

export function classifyEpic(epic: LifecycleEpicRow, ctx: EpicLifecycleContext): EpicLifecycle {
    if (epic.archived === true) {
        return { status: 'Cancelled', excluded: true, exclusion: 'archived', released: false, active: false };
    }

    const status = computeEpicReleaseStatus(epic, ctx.retrosByEpic.get(epic.id) ?? [], {
        releaseSchedule: ctx.releaseSchedule,
    });

    if (status === 'Cancelled') {
        return { status, excluded: true, exclusion: 'cancelled', released: false, active: false };
    }

    const released = isReleasedStatus(status);
    return { status, excluded: false, exclusion: null, released, active: !released };
}

/**
 * The launch date for an epic's release, or null when it has no release or the
 * release has no date.
 *
 * The fuzzy fallback exists because the two sides genuinely disagree about the
 * "Release " prefix and about case. Lifted from criteria-nudges, which was the
 * only place that knew this.
 */
export function resolveReleaseLaunchDate(
    releaseName: string | null,
    ctx: EpicLifecycleContext
): string | null {
    if (!releaseName) return null;

    const normalized = normalizeReleaseName(releaseName);
    const direct = ctx.releaseToDate.get(releaseName) ?? ctx.releaseToDate.get(normalized);
    if (direct) return direct;

    for (const [dbName, dbDate] of ctx.releaseToDate.entries()) {
        const dbNormalized = normalizeReleaseName(dbName);
        if (
            normalized.toLowerCase() === dbNormalized.toLowerCase() ||
            normalized.toLowerCase() === dbName.toLowerCase() ||
            releaseName.toLowerCase() === dbName.toLowerCase()
        ) {
            return dbDate;
        }
    }

    return null;
}
