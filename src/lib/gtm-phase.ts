import type { SupabaseClient } from '@supabase/supabase-js';
import type { Epic } from '@/types/epics';
import { getEpicGtmAccessDateYmd, hasReachedGtmAccessPhase } from '@/lib/epic-rollout-dates';
import { getReleaseStagesForTimeline } from '@/lib/release-stages-server';
import { getActiveReleaseScheduleRows } from '@/lib/release-schedule';
import { getCalendarDateStringInTimeZone } from '@/lib/date-utils';
import { getSettings } from '@/lib/settings-db';
import { defaults } from '@/lib/settings';

/** Minimal epic shape needed to resolve the GTM Access phase. */
export type GtmPhaseEpic = Pick<
    Epic,
    'aha_fields' | 'gtm_access_confirmed' | 'actual_gtm_access_date' | 'target_launch_date'
>;

export type GtmAccessPhaseResolver = (epic: GtmPhaseEpic) => boolean;

/**
 * Build a resolver that reports whether an epic has entered the "GTM Access and Prep"
 * phase — the point from which an unvoted gate becomes a hard no-go (and contributes a
 * red dot). Before that phase an unvoted gate only forces an AT_RISK ceiling and shows
 * no dot.
 *
 * Loads the release-stage timeline, release schedule, and timezone once so the returned
 * resolver can be applied cheaply across many epics. Any load failure yields a resolver
 * that always returns `false` (soft / pre-phase) so we never surprise-block or over-flag.
 */
export async function createGtmAccessPhaseResolver(
    supabase: SupabaseClient
): Promise<GtmAccessPhaseResolver> {
    try {
        const [settings, stages, releaseRows] = await Promise.all([
            getSettings(supabase),
            getReleaseStagesForTimeline(),
            getActiveReleaseScheduleRows(),
        ]);

        const todayYmd = getCalendarDateStringInTimeZone(settings.timezone || defaults.timezone);
        const launchDateByReleaseName = new Map(
            releaseRows.map((r) => [r.release_name, r.launch_date])
        );

        return (epic: GtmPhaseEpic) => {
            try {
                // Fast path: explicitly confirmed → access has happened, we're in the phase.
                if (epic?.gtm_access_confirmed) return true;

                const releaseName =
                    epic?.aha_fields?.standard_fields?.aha_release_name ||
                    epic?.aha_fields?.custom_fields?.release_target_after_pod_planning ||
                    null;
                const releaseTrainDateYmd = releaseName
                    ? launchDateByReleaseName.get(releaseName) ?? null
                    : null;

                const plannedGtmAccessYmd = getEpicGtmAccessDateYmd(
                    epic as Epic,
                    stages.releaseSchedule,
                    stages.uiRollout,
                    { releaseTrainDateYmd: releaseTrainDateYmd ?? undefined }
                );

                return hasReachedGtmAccessPhase({
                    gtmAccessConfirmed: epic?.gtm_access_confirmed,
                    actualGtmAccessYmd: epic?.actual_gtm_access_date ?? null,
                    plannedGtmAccessYmd,
                    todayYmd,
                });
            } catch {
                return false;
            }
        };
    } catch (err) {
        console.error('[createGtmAccessPhaseResolver] Failed to load phase context; defaulting to pre-phase (soft):', err);
        return () => false;
    }
}
