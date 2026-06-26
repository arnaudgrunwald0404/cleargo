import type { SupabaseClient } from '@supabase/supabase-js';
import {
    dateToLocalDateString,
    parseDateOnlyLocal,
    subtractBusinessDays,
    subtractCalendarDays,
} from '@/lib/date-utils';
import {
    computeStageEndDatesByStageId,
    getEffectiveStageDuration,
    type ReleaseTimelineStage,
    type TimelineStageDateOverrides,
} from '@/lib/releaseTimeline';

/** Days before a gate-stage segment end: gate rollup vs sub-criteria (cascading reviews). */
export const GATE_STAGE_DUE_OFFSET_DAYS = { gate: 1, sub: 4 } as const;

/** Row shape from `release_stages` used for due date math. */
export type CriterionDueDateStageRow = {
    id: number;
    name?: string | null;
    sort_order: number;
    duration_days?: number | null;
    level_durations?: Record<string, { min_days: number; max_days: number }> | null;
    scope?: string | null;
    is_gate?: boolean | null;
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

export { getEffectiveStageDuration };

/** Category → stage name fallback when `rating_timing` is unset or stale. */
export function buildCategoryStageFallbackMap(
    stages: Array<{ id: number; name: string }>,
    isUiFramework: boolean
): Map<string, number> {
    const map = new Map<string, number>();
    if (stages.length === 0) return map;
    const byName = new Map(stages.map((s) => [s.name.toLowerCase().trim(), s.id]));
    const uxStage = isUiFramework ? 'ux preview' : 'gtm access and prep';
    const gtmStage = 'gtm access and prep';
    const mappings: [string, string][] = [
        ['strategy', 'product definition complete'],
        ['legal & security', 'product definition complete'],
        ['legal_security', 'product definition complete'],
        ['ux & research', uxStage],
        ['product_tech', uxStage],
        ['technical readiness', uxStage],
        ['product documentation', gtmStage],
        ['product_documentation', gtmStage],
        ['gtm', gtmStage],
        ['enablement & training readiness', gtmStage],
        ['sales enablement', gtmStage],
        ['product marketing', gtmStage],
        ['support', gtmStage],
        ['customer support readiness', gtmStage],
        ['ops', gtmStage],
        ['revenue ops', gtmStage],
        ['product', gtmStage],
        ['customer success', gtmStage],
        ['data & analytics', gtmStage],
        ['data_analytics', gtmStage],
        ['analytics & metrics', gtmStage],
        ['analytics_and_metrics', gtmStage],
        ['implementation scale & customer adoption', 'cohort 1'],
        ['customer success & ongoing adoption', 'cohort 1'],
        ['other', gtmStage],
    ];
    for (const [cat, stageName] of mappings) {
        const id = byName.get(stageName);
        if (id != null) map.set(cat, id);
    }
    return map;
}

/** Apply cascading-review offset before a gate-stage segment end (Go/No-Go minus N days). */
export function applyGateStageDueOffset(
    stageEndYmd: string,
    isGateCriterion: boolean,
    useBusinessDays: boolean
): string {
    const offsetDays = isGateCriterion
        ? GATE_STAGE_DUE_OFFSET_DAYS.gate
        : GATE_STAGE_DUE_OFFSET_DAYS.sub;
    const parsed = parseDateOnlyLocal(stageEndYmd);
    if (!parsed) return stageEndYmd;
    const adjusted = useBusinessDays
        ? subtractBusinessDays(parsed, offsetDays)
        : subtractCalendarDays(parsed, offsetDays);
    return dateToLocalDateString(adjusted);
}

/**
 * Criterion due date (YYYY-MM-DD): end of the rated stage segment on the launch timeline,
 * with gate-stage cascading offsets (sub-items −4d, gate rollups −1d before segment end).
 */
export function computeCriterionDueDateYmd(params: {
    anchorYmd: string | null;
    ratingTimingId: number | null;
    allStages: CriterionDueDateStageRow[];
    uiLevel?: number | null;
    isGateCriterion?: boolean;
    cohort2Date?: string | null;
    stageOverrides?: TimelineStageDateOverrides | null;
}): string | null {
    const { anchorYmd, ratingTimingId, allStages, uiLevel, isGateCriterion, cohort2Date, stageOverrides } = params;
    if (!anchorYmd || ratingTimingId == null) return null;

    const targetStage = allStages.find((s) => s.id === ratingTimingId);
    if (!targetStage) return null;

    const scope = targetStage.scope ?? 'release_schedule';
    const scopedStages = allStages.filter((s) => (s.scope ?? 'release_schedule') === scope);
    const useBusinessDayTimeline = scope === 'ui_rollout';

    const endMap = computeStageEndDatesByStageId(
        scopedStages as ReleaseTimelineStage[],
        anchorYmd,
        {
            useBusinessDayTimeline,
            uiLevel: useBusinessDayTimeline ? (uiLevel ?? null) : null,
            cohort2Date: cohort2Date ?? null,
            stageOverrides: stageOverrides ?? null,
        }
    );

    const stageEndYmd = endMap.get(ratingTimingId);
    if (!stageEndYmd) return null;

    if (targetStage.is_gate) {
        return applyGateStageDueOffset(stageEndYmd, isGateCriterion === true, useBusinessDayTimeline);
    }

    return stageEndYmd;
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
