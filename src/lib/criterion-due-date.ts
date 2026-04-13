import type { SupabaseClient } from '@supabase/supabase-js';

/** Row shape from `release_stages` used for due date math (matches `calculateDueDateForCriterion`). */
export type CriterionDueDateStageRow = {
    id: number;
    name?: string | null;
    sort_order: number;
    duration_days?: number | null;
    level_durations?: Record<string, { min_days: number; max_days: number }> | null;
    scope?: string | null;
};

export function getReleaseNameFromAhaFields(ahaFields: unknown): string | null {
    if (!ahaFields || typeof ahaFields !== 'object') return null;
    const fields = ahaFields as Record<string, unknown>;
    const standardFields = fields.standard_fields as Record<string, unknown> | undefined;
    if (standardFields && typeof standardFields === 'object') {
        const releaseName = (standardFields.aha_release_name ?? (standardFields.release as { name?: string })?.name) as
            | string
            | undefined;
        if (releaseName && typeof releaseName === 'string' && releaseName.trim()) return releaseName.trim();
    }
    const customFields = fields.custom_fields as Record<string, unknown> | undefined;
    if (customFields && typeof customFields === 'object') {
        const releaseName = customFields.release_target_after_pod_planning as string | undefined;
        if (releaseName && typeof releaseName === 'string' && releaseName.trim()) return releaseName.trim();
    }
    return null;
}

/**
 * Prefer the canonical date from `release_schedule` for the epic's Aha release name;
 * fall back to the epic's `target_launch_date` when no row matches or launch_date is empty.
 */
export function resolveAnchorLaunchDateFromReleaseSchedule(
    releaseName: string | null | undefined,
    releaseSchedule: Array<{ release_name: string; launch_date: string | null }>,
    targetLaunchDate: string | null | undefined
): string | null {
    const trimmed = releaseName?.trim();
    if (trimmed) {
        const row = releaseSchedule.find((r) => (r.release_name || '').trim() === trimmed);
        if (row?.launch_date) {
            const ymd = String(row.launch_date).trim().split('T')[0];
            if (ymd) return ymd;
        }
    }
    if (targetLaunchDate && String(targetLaunchDate).trim()) {
        return String(targetLaunchDate).trim().split('T')[0];
    }
    return null;
}

function getCleargoCandidateRaw(ahaFields: unknown): string | boolean | undefined {
    const customFields = (ahaFields as { custom_fields?: Record<string, unknown> } | null)?.custom_fields;
    if (!customFields || typeof customFields !== 'object') return undefined;
    const v = (customFields as Record<string, unknown>).cleargo_candidate;
    return v === null || v === undefined ? undefined : (v as string | boolean);
}

/** UI Framework epics use per-level stage durations when computing due dates. */
export function getUiFrameworkDueDateOptions(ahaFields: unknown): { isUiFramework: boolean; uiLevel?: number } {
    const raw = getCleargoCandidateRaw(ahaFields);
    const isUiFramework = raw === 'Yes - UI Framework';
    if (!isUiFramework) return { isUiFramework: false };
    const aha = ahaFields as { custom_fields?: { uiux_impact?: { name?: string } | string } } | undefined;
    const uiuxImpact = aha?.custom_fields?.uiux_impact;
    const uiuxImpactStr =
        typeof uiuxImpact === 'object' && uiuxImpact && 'name' in uiuxImpact
            ? String((uiuxImpact as { name?: string }).name)
            : uiuxImpact != null
              ? String(uiuxImpact)
              : '';
    const levelMatch = uiuxImpactStr.match(/\b([123])\b/);
    const uiLevel = levelMatch ? parseInt(levelMatch[1], 10) : undefined;
    return { isUiFramework: true, uiLevel };
}

export function getEffectiveStageDuration(
    stage: {
        duration_days?: number | null;
        level_durations?: Record<string, { min_days: number; max_days: number }> | null;
    },
    uiLevel: number | null | undefined
): number | null {
    if (uiLevel != null && stage.level_durations && typeof stage.level_durations === 'object') {
        const d = stage.level_durations[String(uiLevel)];
        if (d && typeof d.min_days === 'number') {
            return d.min_days;
        }
    }
    return stage.duration_days ?? null;
}

/**
 * Synchronous due date (YYYY-MM-DD) from anchor launch date and rating_timing stage — same rules as
 * `calculateDueDateForCriterion` in `epics.ts`.
 */
export function computeCriterionDueDateYmd(params: {
    anchorYmd: string | null;
    ratingTimingId: number | null;
    allStages: CriterionDueDateStageRow[];
    uiLevel?: number | null;
}): string | null {
    const { anchorYmd, ratingTimingId, allStages, uiLevel } = params;
    if (!anchorYmd) return null;

    const targetStage = allStages.find((s) => s.id === ratingTimingId);
    if (!targetStage) return null;

    const scope = targetStage.scope ?? 'release_schedule';
    const releaseStages = allStages.filter((s) => (s.scope ?? 'release_schedule') === scope);

    const cohort1Stage = releaseStages.find((s) => String(s.name || '').toLowerCase().includes('cohort 1'));
    const lastPreLaunchSortOrder = cohort1Stage ? (cohort1Stage.sort_order as number) - 1 : 3;

    const dueDate = new Date(anchorYmd);
    if (isNaN(dueDate.getTime())) return null;

    if (targetStage.sort_order <= lastPreLaunchSortOrder) {
        const stagesAfterTarget = releaseStages.filter((s) => {
            const dur = getEffectiveStageDuration(s, uiLevel);
            return s.sort_order > targetStage.sort_order && s.sort_order <= lastPreLaunchSortOrder && dur !== null;
        });
        const totalDaysBefore =
            (getEffectiveStageDuration(targetStage, uiLevel) || 0) +
            stagesAfterTarget.reduce((sum, s) => sum + (getEffectiveStageDuration(s, uiLevel) ?? 0), 0);
        dueDate.setDate(dueDate.getDate() - totalDaysBefore);
    } else {
        const postLaunchStages = releaseStages.filter((s) => {
            const dur = getEffectiveStageDuration(s, uiLevel);
            return s.sort_order > lastPreLaunchSortOrder && s.sort_order <= targetStage.sort_order && dur !== null;
        });
        const totalDaysAfter = postLaunchStages.reduce((sum, s) => sum + (getEffectiveStageDuration(s, uiLevel) ?? 0), 0);
        dueDate.setDate(dueDate.getDate() + totalDaysAfter);
    }

    return dueDate.toISOString().split('T')[0];
}

export async function fetchAnchorLaunchDateForEpic(
    sb: SupabaseClient,
    epic: { target_launch_date: string | null; aha_fields?: unknown }
): Promise<string | null> {
    const { data: schedule, error } = await sb.from('release_schedule').select('release_name, launch_date').eq('archived', false);

    if (error) {
        console.warn('fetchAnchorLaunchDateForEpic: release_schedule query failed', error);
    }

    const releaseName = getReleaseNameFromAhaFields(epic.aha_fields);
    return resolveAnchorLaunchDateFromReleaseSchedule(releaseName, schedule ?? [], epic.target_launch_date);
}
