/**
 * Stage-derived due dates for epic criteria, for the nudge job.
 *
 * Epic criteria DO have due dates — `computeCriterionDueDateYmd` derives them from
 * `rating_timing` (which release stage the criterion must be ready by) and the
 * release-stage timeline. The epic page, My Items, HomeDashboard and db/epics all
 * use it.
 *
 * The nudge job was the one consumer that ignored it: it keys off
 * `condition_due_date`, which only exists once someone has recorded a Conditional
 * Go condition. So a criterion with a perfectly good derived deadline was
 * displayed as due and then never chased — which is the gap behind Akram's ask for
 * gate-stakeholder deadlines.
 *
 * Stages are fetched once here rather than per criterion, which is why this does
 * not just call db/epics' calculateDueDateForCriterion in a loop.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
    computeCriterionDueDateYmd,
    getReleaseNameFromAhaFields,
    getUiFrameworkDueDateOptions,
    resolveAnchorLaunchDateFromReleaseSchedule,
    type CriterionDueDateStageRow,
} from '@/lib/criterion-due-date';
import { diffCalendarDaysBetweenYmd } from '@/lib/date-utils';

export interface DerivableRow {
    id: string;
    epic_id: string;
    criterion_id: string;
    status?: string | null;
    /** An explicit condition due date always wins over the derived one. */
    condition_due_date?: string | null;
    criterion?: { rating_timing?: number | string | null; gate?: boolean | string | null } | null;
    epic?: { target_launch_date?: string | null; aha_fields?: unknown } | null;
}

/** Coerce rating_timing, which Supabase may hand back as a string. */
function toStageId(raw: unknown): number | null {
    if (raw == null) return null;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : null;
}

/**
 * Attach a derived due date to each row that has no explicit one.
 * Rows that cannot be dated come back with `dueDate: null` and are left alone by
 * callers — a criterion with no stage timing has no deadline to chase.
 */
export async function attachDerivedDueDates<T extends DerivableRow>(
    supabase: SupabaseClient,
    rows: T[]
): Promise<Array<T & { dueDate: string | null; dueSource: 'condition' | 'stage' | 'none' }>> {
    if (rows.length === 0) return [];

    const { data: stages, error } = await supabase
        .from('release_stages')
        .select('id, name, sort_order, duration_days, level_durations, scope, is_gate')
        .order('sort_order', { ascending: true });

    if (error || !stages || stages.length === 0) {
        console.warn(
            '[derivedCriterionDueDates] release_stages unavailable; falling back to condition dates only.',
            error?.message
        );
        return rows.map((r) => ({
            ...r,
            dueDate: r.condition_due_date ?? null,
            dueSource: (r.condition_due_date ? 'condition' : 'none') as 'condition' | 'none',
        }));
    }

    return rows.map((r) => {
        if (r.condition_due_date) {
            return { ...r, dueDate: r.condition_due_date, dueSource: 'condition' as const };
        }
        const derived = computeCriterionDueDateYmd({
            anchorYmd: r.epic?.target_launch_date ?? null,
            ratingTimingId: toStageId(r.criterion?.rating_timing),
            allStages: stages as CriterionDueDateStageRow[],
            cohort2Date: null,
            isGateCriterion: r.criterion?.gate === true || r.criterion?.gate === 'hard',
        });
        return {
            ...r,
            dueDate: derived,
            dueSource: (derived ? 'stage' : 'none') as 'stage' | 'none',
        };
    });
}

/**
 * Days until a row is due, negative once overdue. Null when it has no date.
 * Thin wrapper so callers do not each re-derive the sign convention.
 */
export function daysUntilDue(dueDate: string | null, todayYmd: string): number | null {
    return dueDate ? diffCalendarDaysBetweenYmd(dueDate, todayYmd) : null;
}

/**
 * The release-schedule-aware derivation — the one My Items shows.
 *
 * `attachDerivedDueDates` above anchors straight on `epic.target_launch_date`,
 * which is right for the nudge job but is not what the UI displays. My Items
 * resolves the anchor through the release schedule (falling back to the epic's
 * own date), feeds the release's cohort-2 date in, and applies UI-framework
 * levels. On any epic whose release GA date differs from its target date, the
 * two disagree.
 *
 * This exists so the connector shows the same dates as the app rather than a
 * near-miss. It is deliberately parked next to the simpler version: they are two
 * answers to one question, and the eventual fix is for the nudge job to move
 * onto this one and delete the other. Collapsing the route bodies in
 * api/my-items, HomeDashboard and paprico/agendaService onto this is the rest of
 * that cleanup.
 *
 * Takes an explicit client: the shared getActiveReleaseScheduleRows /
 * getReleaseStagesForTimeline helpers build their own cookie-backed client,
 * which authenticates as anon from an MCP tool or a background job.
 */
export interface ReleaseAwareDueRow {
    /** epic_criterion_status.id — the key in the returned map. */
    id: string;
    epicId: string;
    /** An explicitly recorded Conditional Go date, used when nothing derives. */
    conditionDueDate?: string | null;
    ratingTiming?: number | string | null;
    isGate?: boolean;
}

export async function computeReleaseAwareDueDates(
    supabase: SupabaseClient,
    rows: ReleaseAwareDueRow[]
): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    if (rows.length === 0) return out;

    const epicIds = [...new Set(rows.map((r) => r.epicId).filter(Boolean))];
    if (epicIds.length === 0) {
        for (const r of rows) out.set(r.id, r.conditionDueDate ?? null);
        return out;
    }

    const [epicsResult, scheduleResult, stagesResult] = await Promise.all([
        supabase.from('epic').select('id, aha_fields, target_launch_date').in('id', epicIds),
        supabase
            .from('release_schedule')
            .select('release_name, launch_date, cohort2_date')
            .eq('archived', false),
        supabase
            .from('release_stages')
            .select('id, name, sort_order, duration_days, level_durations, scope, is_gate')
            .order('sort_order', { ascending: true }),
    ]);

    const epicById = new Map(
        (epicsResult.data ?? []).map((e) => [
            e.id as string,
            e as { id: string; aha_fields: unknown; target_launch_date: string | null },
        ])
    );
    const schedule = (scheduleResult.data ?? []).map((r) => {
        const row = r as {
            release_name: string | null;
            launch_date: string | null;
            cohort2_date?: string | null;
        };
        return {
            release_name: row.release_name ?? '',
            launch_date: row.launch_date ?? null,
            cohort2_date: row.cohort2_date ?? null,
        };
    });
    const stages = (stagesResult.data ?? []) as CriterionDueDateStageRow[];

    // A criterion with no rating_timing is due at the first stage, matching the
    // UI rather than being treated as undated.
    const defaultRatingTimingId =
        (stages.find((s) => (s as { sort_order?: number }).sort_order === 1)?.id ??
            stages[0]?.id ??
            null) as number | null;

    for (const row of rows) {
        const epic = epicById.get(row.epicId);
        const releaseName = getReleaseNameFromAhaFields(epic?.aha_fields);
        const anchor = resolveAnchorLaunchDateFromReleaseSchedule(
            releaseName,
            schedule,
            epic?.target_launch_date ?? null
        );
        const scheduleRow = releaseName
            ? schedule.find((r) => (r.release_name || '').trim() === releaseName.trim())
            : null;
        const uiOpts = getUiFrameworkDueDateOptions(epic?.aha_fields);
        const ratingTimingId = toStageId(row.ratingTiming) ?? defaultRatingTimingId;

        const derived = computeCriterionDueDateYmd({
            anchorYmd: anchor,
            ratingTimingId,
            allStages: stages,
            uiLevel: uiOpts.isUiFramework ? uiOpts.uiLevel : undefined,
            isGateCriterion: row.isGate === true,
            cohort2Date: scheduleRow?.cohort2_date ?? null,
        });

        // Same precedence as My Items: a live anchor wins, and the stored date
        // catches epics with no resolvable release (e.g. "Release: N/A") so they
        // are not silently dropped from overdue counts.
        out.set(row.id, derived ?? row.conditionDueDate ?? null);
    }

    return out;
}
