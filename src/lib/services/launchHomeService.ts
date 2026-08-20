/**
 * Loads the GTM launch sections of the Slack App Home for one person.
 *
 * Dates are not recomputed here: start and due come from the same
 * runwayDueDate / tierAwareDueDate / scheduleState helpers the notification job
 * and the launch UI use, so a PMM sees the same date in all three places.
 */

import { createAdminClient } from '@/lib/supabase/server';
import {
    normalizeGate,
    runwayDueDate,
    scheduleState,
    tierAwareDueDate,
    type CriterionScheduleNode,
} from '@/lib/launchCriteria';
import type { HomeArtifact, HomeBrief, UnassignedGroup } from '@/lib/slack/templates/launch-home';

interface CriterionJoin {
    id: string;
    label: string;
    gate: boolean | string | null;
    depends_on_criterion_id: string | null;
    default_due_offset_days: number | null;
    tier_offset_days: Record<string, number> | null;
}

export interface LaunchHomeWork {
    /** Artifacts explicitly assigned to this person: their to-do list. */
    artifacts: HomeArtifact[];
    /** Unowned artifacts on launches this person owns: their to-assign list. */
    unassigned: UnassignedGroup[];
}

/**
 * The launch work for one person, split into what they must do and what they
 * must assign.
 *
 * The notification job falls back to the launch owner for an unowned artifact,
 * because someone has to be told. Repeating that fallback here was wrong: with
 * 12 of 180 rows owned, it put 168 unassigned artifacts on the owner's home tab
 * and buried the 12 that were actually theirs. An unowned artifact is an
 * assignment gap, not a task, so it is counted separately and links to the
 * launch where owners get set.
 */
export async function loadLaunchHomeWork(
    email: string,
    supabase = createAdminClient(),
    today = new Date().toISOString().slice(0, 10)
): Promise<LaunchHomeWork> {
    const target = email.toLowerCase();

    const { data, error } = await supabase
        .from('launch')
        .select(
            `id, name, tier, target_launch_date, owner_email, created_at,
             launch_criterion_status(
               criterion_id, status, owner_email, due_date,
               criterion:criterion(id, label, gate, depends_on_criterion_id,
                                   default_due_offset_days, tier_offset_days)
             )`
        )
        .eq('archived', false)
        .not('target_launch_date', 'is', null);

    if (error) {
        console.error('loadLaunchHomeWork failed', error.message);
        return { artifacts: [], unassigned: [] };
    }

    const out: HomeArtifact[] = [];
    const unassigned: UnassignedGroup[] = [];

    for (const launch of (data || []) as Array<Record<string, unknown>>) {
        const statuses = (launch.launch_criterion_status as Array<Record<string, unknown>>) || [];
        const launchOwner = ((launch.owner_email as string | null) || '').toLowerCase();
        const tier = (launch.tier as string | null) ?? null;
        const ga = (launch.target_launch_date as string | null) ?? null;

        // The whole criterion set for this launch, needed to resolve a runway
        // due date (a predecessor's due date is its successor's start).
        const nodes: CriterionScheduleNode[] = statuses
            .map((s) => s.criterion as unknown as CriterionJoin | null)
            .filter((c): c is CriterionJoin => !!c)
            .map((c) => ({
                id: c.id,
                depends_on_criterion_id: c.depends_on_criterion_id,
                default_due_offset_days: c.default_due_offset_days,
                tier_offset_days: c.tier_offset_days,
            }));

        // Outstanding dependents per criterion, so a gate can name what it holds up.
        const pendingDependents = new Map<string, string[]>();
        for (const s of statuses) {
            const c = s.criterion as unknown as CriterionJoin | null;
            if (!c?.depends_on_criterion_id) continue;
            if (s.status === 'DONE') continue;
            const list = pendingDependents.get(c.depends_on_criterion_id) || [];
            list.push(c.label);
            pendingDependents.set(c.depends_on_criterion_id, list);
        }

        let unownedHere = 0;

        for (const s of statuses) {
            const c = s.criterion as unknown as CriterionJoin | null;
            if (!c) continue;

            const status = (s.status as HomeArtifact['status']) || 'NOT_STARTED';
            if (status === 'DONE') continue;

            const explicitOwner = ((s.owner_email as string | null) || '').toLowerCase();
            if (!explicitOwner) {
                // Nobody named yet. That is the launch owner's problem to fix,
                // not a task to put on anyone's list.
                if (launchOwner === target) unownedHere++;
                continue;
            }
            if (explicitOwner !== target) continue;

            const node: CriterionScheduleNode = {
                id: c.id,
                depends_on_criterion_id: c.depends_on_criterion_id,
                default_due_offset_days: c.default_due_offset_days,
                tier_offset_days: c.tier_offset_days,
            };

            const startDate = tierAwareDueDate(ga, node, tier);
            // An explicitly set due date wins over the computed runway.
            const dueDate =
                (s.due_date as string | null) || runwayDueDate(ga, node, nodes, tier);

            out.push({
                launchId: launch.id as string,
                launchName: (launch.name as string) || 'Untitled launch',
                label: c.label,
                status,
                startDate,
                dueDate,
                scheduleState: scheduleState({
                    startDate,
                    dueDate,
                    today,
                    launchCreatedAt: (launch.created_at as string | null) ?? null,
                }),
                gate: normalizeGate(c.gate),
                blocking: pendingDependents.get(c.id) || [],
            });
        }

        if (unownedHere > 0) {
            unassigned.push({
                launchId: launch.id as string,
                launchName: (launch.name as string) || 'Untitled launch',
                count: unownedHere,
            });
        }
    }

    return { artifacts: out, unassigned };
}

/**
 * Story Briefs with unanswered gaps where this person is the PM or PMM owner.
 *
 * Scoped to owners rather than "any brief" so the home tab asks each person only
 * about work that is theirs to answer.
 */
export async function loadHomeBriefs(
    email: string,
    supabase = createAdminClient()
): Promise<HomeBrief[]> {
    const target = email.toLowerCase();

    const { data: briefs, error } = await supabase
        .from('epic_story_brief')
        .select('id, epic_id, pm_owner_email, pmm_owner_email, epic:epic(name)')
        .or(`pm_owner_email.eq.${target},pmm_owner_email.eq.${target}`);

    if (error) {
        console.error('loadHomeBriefs failed', error.message);
        return [];
    }
    if (!briefs || briefs.length === 0) return [];

    const out: HomeBrief[] = [];
    for (const brief of briefs as Array<Record<string, unknown>>) {
        const { count, error: countError } = await supabase
            .from('epic_story_brief_flag')
            .select('id', { count: 'exact', head: true })
            .eq('epic_story_brief_id', brief.id as string)
            .in('status', ['open', 'asked']);

        if (countError) {
            console.error('loadHomeBriefs: flag count failed', countError.message);
            continue;
        }
        if (!count) continue;

        out.push({
            target: {
                briefId: brief.id as string,
                epicId: brief.epic_id as string,
                epicName:
                    (brief as { epic?: { name?: string } | null }).epic?.name || 'this epic',
            },
            openCount: count,
        });
    }

    return out;
}
