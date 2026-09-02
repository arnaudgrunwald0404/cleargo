/**
 * Decides what a launch should tell whom, and when.
 *
 * The design choice that matters: notifications fire on STATE TRANSITIONS, not
 * on a cadence. Every artifact now has a start date, a due date and a state
 * (see scheduleState), so each one generates a handful of messages across its
 * whole life rather than one per day until someone mutes the bot. The existing
 * epic nudge jobs have no real cooldown, and that is the failure this avoids.
 *
 * Pure and side-effect free: the job route supplies the data and performs the
 * Slack calls, so the routing rules stay testable.
 */

import { isGating } from '../launch-readiness';
import { effectiveDueDate, resolveOffsetDays, scheduleState, tMinusDueDate } from '../launchCriteria';

export const LAUNCH_NOTIFY_TYPE = 'launch_artifact';

export type LaunchNotifyKind =
    /** The artifact's window has opened — work can start now. */
    | 'window_open'
    /** Past its due date and not done. */
    | 'overdue'
    /** Its predecessor was delivered, so it is no longer waiting. */
    | 'unblocked'
    /** A gate is past due, which blocks everything downstream of it. */
    | 'gate_blocking';

export interface NotifyCriterion {
    criterion_id: string;
    label: string;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
    owner_email: string | null;
    due_date: string | null;
    gate?: boolean | string | null;
    depends_on_criterion_id?: string | null;
    default_due_offset_days?: number | null;
    tier_offset_days?: Record<string, number> | null;
}

export interface NotifyLaunch {
    id: string;
    name: string;
    tier: string | null;
    target_launch_date: string | null;
    owner_email: string | null;
    created_at?: string | null;
    items: NotifyCriterion[];
}

/** One row already in notification_log for this (launch, criterion, kind). */
export interface PriorNotification {
    launch_id: string;
    criterion_id: string;
    kind: LaunchNotifyKind;
    slack_ts?: string | null;
    slack_channel?: string | null;
}

export interface NotifyAction {
    kind: LaunchNotifyKind;
    launchId: string;
    launchName: string;
    criterionId: string;
    label: string;
    /** Who is accountable. Falls back to the launch owner (the PMM). */
    recipientEmail: string;
    startDate: string | null;
    dueDate: string | null;
    /** Labels of artifacts held up by this one — only set for gate_blocking. */
    blocking: string[];
    /** Additional recipients. Gates escalate; ordinary artifacts do not. */
    escalateTo: string[];
    /** When set, edit this message in place instead of posting a new one. */
    editExisting: { slack_ts: string; slack_channel: string } | null;
}

function priorKey(launchId: string, criterionId: string, kind: LaunchNotifyKind): string {
    return `${launchId}::${criterionId}::${kind}`;
}

/**
 * Plan the notifications for one pass.
 *
 * Deduped on (launch, criterion, kind): each artifact says each thing once. A
 * repeat pass finds the prior row and either does nothing or, where the state
 * has moved on, edits the message that already exists — so the DM stays one
 * message per artifact rather than a growing pile.
 */
export function planLaunchNotifications(args: {
    launches: NotifyLaunch[];
    priors: PriorNotification[];
    today: string;
}): NotifyAction[] {
    const { launches, priors, today } = args;
    const priorMap = new Map(priors.map((p) => [priorKey(p.launch_id, p.criterion_id, p.kind), p]));
    const actions: NotifyAction[] = [];

    for (const launch of launches) {
        if (!launch.target_launch_date) continue;

        const byId = new Map(launch.items.map((i) => [i.criterion_id, i]));
        // Who depends on whom, so a blocked gate can name what it is holding up.
        const successors = new Map<string, NotifyCriterion[]>();
        for (const item of launch.items) {
            const dep = item.depends_on_criterion_id;
            if (!dep) continue;
            const list = successors.get(dep) || [];
            list.push(item);
            successors.set(dep, list);
        }

        for (const item of launch.items) {
            if (item.status === 'DONE') continue;

            const startDate = tMinusDueDate(
                launch.target_launch_date,
                resolveOffsetDays(item, launch.tier)
            );
            const state = scheduleState({
                startDate,
                dueDate: item.due_date,
                today,
                launchCreatedAt: launch.created_at ?? null,
                targetLaunchDate: launch.target_launch_date,
            });
            // What the message means by "due": grace-shifted when the runway was
            // compressed, so a DM never quotes a date from before the launch existed.
            const dueDate = effectiveDueDate({
                startDate,
                dueDate: item.due_date,
                launchCreatedAt: launch.created_at ?? null,
                targetLaunchDate: launch.target_launch_date,
            });
            if (state === 'no_date' || state === 'upcoming') continue;

            // The accountable person, or the launch owner when the row is
            // unassigned — never nobody, or the nudge goes nowhere.
            const recipientEmail = item.owner_email || launch.owner_email;
            if (!recipientEmail) continue;

            const gating = isGating(item.gate);
            const blocked = (successors.get(item.criterion_id) || [])
                .filter((s) => s.status !== 'DONE')
                .map((s) => s.label);

            // A predecessor that is done means this artifact is genuinely
            // actionable now, which is worth saying explicitly rather than
            // leaving someone to infer it from a date.
            const predecessor = item.depends_on_criterion_id
                ? byId.get(item.depends_on_criterion_id)
                : undefined;
            const predecessorDone = !predecessor || predecessor.status === 'DONE';

            const kinds: LaunchNotifyKind[] = [];
            if (state === 'late') {
                // A blocked gate is the only thing that escalates. A compressed
                // artifact reaches here only after its fair window from launch
                // creation has closed -- until then it is 'compressed' and the
                // owner is not chased for arithmetic they did not cause.
                kinds.push(gating && blocked.length > 0 ? 'gate_blocking' : 'overdue');
            } else if (state === 'in_window' || state === 'compressed') {
                kinds.push(predecessorDone ? 'window_open' : 'unblocked');
            }

            for (const kind of kinds) {
                const prior = priorMap.get(priorKey(launch.id, item.criterion_id, kind));
                if (prior) continue; // said once already

                // Escalating a gate re-uses whatever earlier message exists for
                // the same artifact, so the thread stays in one place.
                const anyPrior =
                    priorMap.get(priorKey(launch.id, item.criterion_id, 'window_open')) ??
                    priorMap.get(priorKey(launch.id, item.criterion_id, 'unblocked'));

                actions.push({
                    kind,
                    launchId: launch.id,
                    launchName: launch.name,
                    criterionId: item.criterion_id,
                    label: item.label,
                    recipientEmail,
                    startDate,
                    dueDate,
                    blocking: blocked,
                    escalateTo:
                        kind === 'gate_blocking' && launch.owner_email &&
                        launch.owner_email !== recipientEmail
                            ? [launch.owner_email]
                            : [],
                    editExisting:
                        anyPrior?.slack_ts && anyPrior.slack_channel
                            ? { slack_ts: anyPrior.slack_ts, slack_channel: anyPrior.slack_channel }
                            : null,
                });
            }
        }
    }

    return actions;
}

/** Slack copy for one action. Kept beside the rules so both are reviewable together. */
export function describeAction(a: NotifyAction): { text: string; detail: string } {
    const due = a.dueDate ? ` (due ${a.dueDate})` : '';
    switch (a.kind) {
        case 'window_open':
            return {
                text: `${a.label} can start now — ${a.launchName}`,
                detail: `This is your window${due}. Everything downstream waits on it.`,
            };
        case 'unblocked':
            return {
                text: `${a.label} is unblocked — ${a.launchName}`,
                detail: `Its predecessor is delivered, so this can begin${due}.`,
            };
        case 'overdue':
            return {
                text: `${a.label} is overdue — ${a.launchName}`,
                detail: a.blocking.length
                    ? `Past due${due}. Holding up: ${a.blocking.join(', ')}.`
                    : `Past due${due}.`,
            };
        case 'gate_blocking':
            return {
                text: `${a.label} is blocking ${a.launchName}`,
                detail: `This gate is past due${due} and blocks ${a.blocking.join(', ')}. Nothing downstream can proceed until it clears.`,
            };
    }
}
