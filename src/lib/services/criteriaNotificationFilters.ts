/**
 * Shared filters for criteria reminder notifications (Slack, email, stale job).
 * Aligns notification eligibility with readiness scoring and epic UI deduplication.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSignoffCriterion, normalizeStatus } from '@/lib/readiness-scoring';

type CriterionShape = {
    label?: string | null;
    category?: string | null;
};

export type CriterionNotificationRow = {
    id: string;
    epic_id: string;
    criterion_id: string | null;
    status?: string | null;
    last_updated_at?: string | null;
    criterion?: CriterionShape | null;
};

const COMPLETE_STATUSES = new Set(['GO', 'NO_GO', 'NOT_APPLICABLE']);

/** True when a criterion no longer needs completion reminders. */
export function isCriterionCompleteForNotifications(status: string | null | undefined): boolean {
    return COMPLETE_STATUSES.has(normalizeStatus(status));
}

/**
 * When duplicate epic_criterion_status rows exist for the same (epic, criterion),
 * keep the row that best reflects user work (completed status wins, else latest update).
 */
export function dedupeCriteriaForNotifications<T extends CriterionNotificationRow>(criteria: T[]): T[] {
    const byKey = new Map<string, T>();

    for (const row of criteria) {
        if (!row.criterion_id) {
            byKey.set(row.id, row);
            continue;
        }
        const key = `${row.epic_id}::${row.criterion_id}`;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, row);
            continue;
        }
        byKey.set(key, pickPreferredCriterionNotificationRow(existing, row));
    }

    return Array.from(byKey.values());
}

function pickPreferredCriterionNotificationRow<T extends CriterionNotificationRow>(a: T, b: T): T {
    const aComplete = isCriterionCompleteForNotifications(a.status);
    const bComplete = isCriterionCompleteForNotifications(b.status);
    if (aComplete && !bComplete) return a;
    if (bComplete && !aComplete) return b;

    const aTime = a.last_updated_at ? new Date(a.last_updated_at).getTime() : 0;
    const bTime = b.last_updated_at ? new Date(b.last_updated_at).getTime() : 0;
    return bTime >= aTime ? b : a;
}

/**
 * Exclude criteria in categories where a signoff row is GO (readiness signoff override).
 * Non-signoff rows can remain NOT_SET in the DB but are treated as satisfied for scoring.
 */
export async function filterCriteriaSuppressedByCategorySignoffGo<T extends CriterionNotificationRow>(
    criteria: T[],
    supabase: SupabaseClient
): Promise<T[]> {
    if (criteria.length === 0) return criteria;

    const epicIds = [...new Set(criteria.map((c) => c.epic_id))];
    const { data: rows, error } = await supabase
        .from('epic_criterion_status')
        .select('epic_id, status, criterion:criterion_id(label, category)')
        .in('epic_id', epicIds);

    if (error) {
        console.error('[criteriaNotificationFilters] signoff lookup failed:', error.message);
        return criteria;
    }

    const signoffGoCategories = new Set<string>();
    for (const row of rows || []) {
        const crit = Array.isArray((row as any).criterion)
            ? (row as any).criterion[0]
            : (row as any).criterion;
        const label = crit?.label as string | undefined;
        const category = crit?.category as string | undefined;
        if (!label || !category) continue;
        if (isSignoffCriterion(label) && normalizeStatus((row as any).status) === 'GO') {
            signoffGoCategories.add(`${(row as any).epic_id}::${category}`);
        }
    }

    if (signoffGoCategories.size === 0) return criteria;

    const filtered = criteria.filter((c) => {
        const category = c.criterion?.category;
        if (!category) return true;
        const key = `${c.epic_id}::${category}`;
        if (!signoffGoCategories.has(key)) return true;
        return isSignoffCriterion(c.criterion?.label);
    });

    const suppressed = criteria.length - filtered.length;
    if (suppressed > 0) {
        console.log(
            `[criteriaNotificationFilters] Suppressed ${suppressed} criteria covered by category signoff GO`
        );
    }

    return filtered;
}

/** Drop rows that are complete by normalized status (safety net after DB query). */
export function filterIncompleteCriteriaForNotifications<T extends CriterionNotificationRow>(
    criteria: T[]
): T[] {
    return criteria.filter((c) => !isCriterionCompleteForNotifications(c.status));
}
