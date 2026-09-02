/**
 * Which checklist rows a launch page shows under the My tasks / Overdue / Due
 * soon chips, matching the epic readiness filters in src/app/epics/[id]/page.tsx.
 *
 * Kept as a pure module (like launchCriteria.ts) rather than inline in the page
 * so the date rules are testable. Nothing here re-derives a date: lateness comes
 * from scheduleState and the deadline from effectiveDueDate, so a compressed
 * runway keeps behaving the way the checklist cell and the nudge job already
 * treat it -- at risk, but not a miss.
 */

import { addCalendarDaysToYmd } from './date-utils';
import { effectiveDueDate, scheduleState, tierAwareDueDate } from './launchCriteria';

/** Matches the epic page's 14-day "due soon" horizon. */
export const DUE_SOON_WINDOW_DAYS = 14;

export interface LaunchChecklistFilters {
    myTasks: boolean;
    overdue: boolean;
    dueSoon: boolean;
}

export const NO_LAUNCH_CHECKLIST_FILTERS: LaunchChecklistFilters = {
    myTasks: false,
    overdue: false,
    dueSoon: false,
};

/**
 * Structural subset of the checklist row. Declared here rather than imported
 * from the table component so the dependency runs UI -> lib, not the reverse;
 * ChecklistRow is a superset and satisfies it.
 */
export interface FilterableChecklistItem {
    owner_email: string | null;
    status: string;
}

export interface FilterableChecklistRow {
    status: string;
    owner_email: string | null;
    due_date: string | null;
    items?: FilterableChecklistItem[];
    criterion: {
        default_due_offset_days?: number | null;
        tier_offset_days?: Record<string, number> | null;
    };
}

export interface LaunchChecklistContext {
    targetLaunchDate: string | null;
    tier: string | null;
    launchCreatedAt?: string | null;
    currentUserEmail?: string | null;
    /** YYYY-MM-DD. Injectable so the rules are testable. */
    today?: string;
}

/** A row nobody has to finish. Neither closed state can be late or due soon. */
function isClosed(status: string): boolean {
    return status === 'DONE' || status === 'NOT_APPLICABLE';
}

function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) return false;
    return a.toLowerCase() === b.toLowerCase();
}

/** The window args scheduleState and effectiveDueDate both take for one row. */
function windowFor(row: FilterableChecklistRow, ctx: LaunchChecklistContext) {
    return {
        startDate: tierAwareDueDate(
            ctx.targetLaunchDate,
            {
                default_due_offset_days: row.criterion?.default_due_offset_days ?? null,
                tier_offset_days: row.criterion?.tier_offset_days ?? null,
            },
            ctx.tier
        ),
        dueDate: row.due_date,
        launchCreatedAt: ctx.launchCreatedAt ?? null,
        targetLaunchDate: ctx.targetLaunchDate,
    };
}

/**
 * Mine if I own the gate row OR any item inside it. The items are the point of
 * a gate -- Beta alone spans PM, SE, UX, PMM and RevOps, each item owned by its
 * own function -- so checking only the row owner would hide most of a person's
 * real work behind gates that are themselves unassigned.
 */
export function rowIsMine(
    row: FilterableChecklistRow,
    currentUserEmail: string | null | undefined
): boolean {
    if (!currentUserEmail) return false;
    if (sameEmail(row.owner_email, currentUserEmail)) return true;
    return (row.items || []).some((item) => sameEmail(item.owner_email, currentUserEmail));
}

/**
 * Late by the same rule the checklist cell and the notification job use. Going
 * through scheduleState rather than comparing due_date to today is what keeps a
 * compressed row -- one whose window closed before the launch record existed --
 * out of Overdue while its re-granted window is still open.
 */
export function rowIsOverdue(row: FilterableChecklistRow, ctx: LaunchChecklistContext): boolean {
    if (isClosed(row.status)) return false;
    const today = ctx.today ?? new Date().toISOString().slice(0, 10);
    return scheduleState({ ...windowFor(row, ctx), today }) === 'late';
}

/**
 * Deadline inside the next DUE_SOON_WINDOW_DAYS. Uses effectiveDueDate so a
 * compressed row is measured against the window it was actually granted rather
 * than a date that fell before the launch existed.
 */
export function rowIsDueSoon(row: FilterableChecklistRow, ctx: LaunchChecklistContext): boolean {
    if (isClosed(row.status)) return false;
    const today = ctx.today ?? new Date().toISOString().slice(0, 10);
    const due = effectiveDueDate(windowFor(row, ctx));
    if (!due) return false;
    const horizon = addCalendarDaysToYmd(today, DUE_SOON_WINDOW_DAYS);
    if (!horizon) return false;
    return due >= today && due <= horizon;
}

export function anyLaunchChecklistFilterActive(filters: LaunchChecklistFilters): boolean {
    return filters.myTasks || filters.overdue || filters.dueSoon;
}

/**
 * My tasks ANDs with the date chips; Overdue and Due soon OR with each other, so
 * turning both on reads as "everything with a deadline worth looking at" -- the
 * same combination rule the epic readiness filters use.
 */
export function filterLaunchChecklistRows<T extends FilterableChecklistRow>(
    rows: T[],
    filters: LaunchChecklistFilters,
    ctx: LaunchChecklistContext
): T[] {
    if (!anyLaunchChecklistFilterActive(filters)) return rows;

    return rows.filter((row) => {
        if (filters.myTasks && !rowIsMine(row, ctx.currentUserEmail)) return false;

        if (filters.overdue && filters.dueSoon) {
            return rowIsOverdue(row, ctx) || rowIsDueSoon(row, ctx);
        }
        if (filters.overdue) return rowIsOverdue(row, ctx);
        if (filters.dueSoon) return rowIsDueSoon(row, ctx);
        return true;
    });
}
