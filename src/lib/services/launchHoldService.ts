/**
 * Which epics are on Launch Hold, resolved in one pass.
 *
 * Both surfaces need this — the release list on /epics and the epic's own page —
 * so it is a batch lookup rather than a per-epic query. The /epics list can carry
 * a couple of hundred rows and a per-row round trip would be the wrong shape.
 *
 * Three joins, no more: the launches an epic belongs to, those launches' dates,
 * and the epic's RevOps sign-off status.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateLaunchHold, REVOPS_SIGNOFF_LABEL, type LaunchHold } from '@/lib/launchHold';

export interface EpicHoldInfo extends LaunchHold {
    launchId: string;
    launchName: string;
    launchDate: string;
}

/** epicId -> hold, for epics that are on hold. Absent means not on hold. */
export type LaunchHoldMap = Map<string, EpicHoldInfo>;

export async function resolveLaunchHolds(
    supabase: SupabaseClient,
    epics: ReadonlyArray<{ id: string; target_launch_date?: string | null }>
): Promise<LaunchHoldMap> {
    const out: LaunchHoldMap = new Map();
    // Only epics with a date can be early for anything.
    const dated = epics.filter((e) => e.target_launch_date);
    if (dated.length === 0) return out;

    const epicIds = dated.map((e) => e.id);

    const { data: links, error: linkError } = await supabase
        .from('launch_epic')
        .select('epic_id, launch:launch(id, name, target_launch_date, archived)')
        .in('epic_id', epicIds);

    if (linkError) {
        console.error('[launchHoldService] launch_epic lookup failed:', linkError.message);
        return out;
    }
    if (!links || links.length === 0) return out;

    // An epic can in principle sit on several launches. Take the earliest dated,
    // live launch: that is the one it would be running ahead of first.
    const launchByEpic = new Map<string, { id: string; name: string; date: string }>();
    for (const row of links) {
        const l = (Array.isArray(row.launch) ? row.launch[0] : row.launch) as
            | { id: string; name: string; target_launch_date: string | null; archived: boolean | null }
            | null;
        if (!l || l.archived || !l.target_launch_date) continue;
        const epicId = row.epic_id as string;
        const held = launchByEpic.get(epicId);
        if (!held || l.target_launch_date < held.date) {
            launchByEpic.set(epicId, {
                id: l.id,
                name: l.name || 'Untitled launch',
                date: l.target_launch_date,
            });
        }
    }
    if (launchByEpic.size === 0) return out;

    // The RevOps criterion is one row in the template; resolve its id once.
    const { data: criterion, error: criterionError } = await supabase
        .from('criterion')
        .select('id')
        .eq('context', 'release')
        .eq('label', REVOPS_SIGNOFF_LABEL)
        .maybeSingle();

    if (criterionError) {
        console.error('[launchHoldService] RevOps criterion lookup failed:', criterionError.message);
        return out;
    }
    if (!criterion?.id) {
        console.warn(`[launchHoldService] "${REVOPS_SIGNOFF_LABEL}" not found; no holds evaluated.`);
        return out;
    }

    const candidateIds = [...launchByEpic.keys()];
    const { data: statuses, error: statusError } = await supabase
        .from('epic_criterion_status')
        .select('epic_id, status')
        .eq('criterion_id', criterion.id)
        .in('epic_id', candidateIds);

    if (statusError) {
        console.error('[launchHoldService] RevOps status lookup failed:', statusError.message);
        return out;
    }

    const statusByEpic = new Map(
        (statuses || []).map((s) => [s.epic_id as string, s.status as string | null])
    );

    for (const epic of dated) {
        const launch = launchByEpic.get(epic.id);
        if (!launch) continue;
        // An epic with no RevOps row at all has certainly not been signed off,
        // so an absent status is treated as unanswered rather than skipped.
        const hold = evaluateLaunchHold({
            epicDate: epic.target_launch_date,
            launchDate: launch.date,
            revOpsStatus: statusByEpic.get(epic.id) ?? null,
        });
        if (hold) {
            out.set(epic.id, {
                ...hold,
                launchId: launch.id,
                launchName: launch.name,
                launchDate: launch.date,
            });
        }
    }

    return out;
}
