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
