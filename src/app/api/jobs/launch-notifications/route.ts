/**
 * Launch artifact notifications: state-transition driven, one message per artifact.
 *
 * Delivery goes through sendSlackNotification like every other notification
 * type, so it lands in the ClearGO Launch Console DM of the single person it
 * applies to and inherits handle sync, the per-user opt-out and skip logging.
 * This job only decides WHAT to say and to WHOM.
 *
 * Two notes on the seams it uses:
 *  - it passes gtm_launch_id, not launch_id. The latter means an EPIC id
 *    (legacy from 0018_rename_launch_to_epic.sql) and carries a hard skip when
 *    that epic's release is unsynced, which would drop every launch message.
 *  - editing an existing message goes direct to the Slack client, because
 *    sendSlackNotification only posts. The ts comes from notification_log,
 *    written by the send on an earlier pass.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getSlackClient } from '@/lib/slack/client';
import { logNotification, sendSlackNotification } from '@/lib/slack/notifications';
import { getNotificationCalendarSkip } from '@/lib/services/notificationCalendarService';
import {
    LAUNCH_NOTIFY_TYPE,
    describeAction,
    planLaunchNotifications,
    type LaunchNotifyKind,
    type NotifyLaunch,
    type PriorNotification,
} from '@/lib/services/launchNotificationService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface CriterionJoin {
    id: string;
    label: string;
    gate: boolean | string | null;
    depends_on_criterion_id: string | null;
    default_due_offset_days: number | null;
    tier_offset_days: Record<string, number> | null;
}

/**
 * Build the SlackUser sendSlackNotification expects. It syncs a missing handle
 * from the email itself, so an app_user row is enough; the fallback covers an
 * owner who is not in app_user at all.
 */
async function resolveRecipient(
    supabase: ReturnType<typeof createAdminClient>,
    email: string
): Promise<{ id: string; email: string; name: string; slack_handle?: string }> {
    const { data } = await supabase
        .from('app_user')
        .select('id, email, first_name, last_name, slack_handle')
        .eq('email', email.toLowerCase())
        .maybeSingle();

    const name =
        [data?.first_name, data?.last_name].filter(Boolean).join(' ') || email;
    return {
        id: data?.id || email,
        email: data?.email || email,
        name,
        slack_handle: data?.slack_handle || undefined,
    };
}

export async function GET(request: NextRequest) {
    const startTime = Date.now();
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const dryRun = request.nextUrl.searchParams.get('dry_run') === 'true';
        const testEmail = request.nextUrl.searchParams.get('test_email')?.trim().toLowerCase();

        // Person-triggered and dry runs bypass the business calendar; scheduled
        // sends hold to working days in the org timezone.
        const calendarSkip = await getNotificationCalendarSkip(request, {
            cadence: 'daily',
            force: dryRun || Boolean(testEmail),
        });
        if (calendarSkip) return NextResponse.json(calendarSkip);

        const supabase = createAdminClient();
        const today = new Date().toISOString().slice(0, 10);

        const { data: launchRows, error: launchError } = await supabase
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

        if (launchError) {
            return NextResponse.json({ success: false, error: launchError.message }, { status: 500 });
        }

        const launches: NotifyLaunch[] = (launchRows || []).map((l: Record<string, unknown>) => ({
            id: l.id as string,
            name: l.name as string,
            tier: (l.tier as string | null) ?? null,
            target_launch_date: (l.target_launch_date as string | null) ?? null,
            owner_email: (l.owner_email as string | null) ?? null,
            created_at: (l.created_at as string | null) ?? null,
            items: ((l.launch_criterion_status as Array<Record<string, unknown>>) || []).map((s) => {
                const c = s.criterion as unknown as CriterionJoin | null;
                return {
                    criterion_id: s.criterion_id as string,
                    label: c?.label ?? '',
                    status: s.status as 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE',
                    owner_email: (s.owner_email as string | null) ?? null,
                    due_date: (s.due_date as string | null) ?? null,
                    gate: c?.gate ?? null,
                    depends_on_criterion_id: c?.depends_on_criterion_id ?? null,
                    default_due_offset_days: c?.default_due_offset_days ?? null,
                    tier_offset_days: c?.tier_offset_days ?? null,
                };
            }),
        }));

        // Everything already said about a launch artifact. The `kind` lives in the
        // payload rather than its own column, so dedupe reads it back out.
        const { data: priorRows } = await supabase
            .from('notification_log')
            .select('launch_id, criterion_id, payload, slack_ts, slack_channel')
            .eq('type', LAUNCH_NOTIFY_TYPE)
            .not('launch_id', 'is', null)
            .eq('status', 'sent');

        const priors: PriorNotification[] = (priorRows || [])
            .map((r: Record<string, unknown>) => ({
                launch_id: r.launch_id as string,
                criterion_id: r.criterion_id as string,
                kind: ((r.payload as Record<string, unknown> | null)?.kind as LaunchNotifyKind) ?? 'window_open',
                slack_ts: (r.slack_ts as string | null) ?? null,
                slack_channel: (r.slack_channel as string | null) ?? null,
            }))
            .filter((p) => !!p.criterion_id);

        let actions = planLaunchNotifications({ launches, priors, today });
        if (testEmail) actions = actions.filter((a) => a.recipientEmail.toLowerCase() === testEmail);

        if (dryRun) {
            return NextResponse.json({
                success: true,
                dry_run: true,
                today,
                launches_considered: launches.length,
                planned: actions.map((a) => ({ ...a, copy: describeAction(a) })),
            });
        }

        let sent = 0;
        let edited = 0;
        const failures: Array<{ label: string; error: string }> = [];

        for (const action of actions) {
            try {
                const metadata = {
                    kind: action.kind,
                    launch_id: action.launchId,
                    launch_name: action.launchName,
                    label: action.label,
                    start_date: action.startDate,
                    due_date: action.dueDate,
                    blocking: action.blocking,
                };

                if (action.editExisting) {
                    // One message per artifact for its whole life: rewrite the
                    // note already in the DM rather than adding another.
                    const { buildLaunchArtifactMessage } = await import(
                        '@/lib/slack/templates/launch-artifacts'
                    );
                    const built = buildLaunchArtifactMessage(metadata);
                    await getSlackClient().updateMessage(
                        action.editExisting.slack_channel,
                        action.editExisting.slack_ts,
                        { text: built.text, blocks: built.blocks as never }
                    );
                    await logNotification({
                        gtm_launch_id: action.launchId,
                        criterion_id: action.criterionId,
                        type: LAUNCH_NOTIFY_TYPE,
                        payload: { ...metadata, edited: true },
                        delivery_channel: 'slack',
                        status: 'sent',
                        slack_ts: action.editExisting.slack_ts,
                        slack_channel: action.editExisting.slack_channel,
                    });
                    edited++;
                    continue;
                }

                const recipient = await resolveRecipient(supabase, action.recipientEmail);
                await sendSlackNotification({
                    type: LAUNCH_NOTIFY_TYPE,
                    priority: action.kind === 'gate_blocking' ? 'high' : 'medium',
                    recipient,
                    gtm_launch_id: action.launchId,
                    criterion_id: action.criterionId,
                    metadata,
                });
                sent++;

                // A blocking gate is the only thing that reaches anyone beyond
                // the owner, and it names the owner so the reader knows who to chase.
                for (const escalate of action.escalateTo) {
                    await sendSlackNotification({
                        type: LAUNCH_NOTIFY_TYPE,
                        priority: 'high',
                        recipient: await resolveRecipient(supabase, escalate),
                        gtm_launch_id: action.launchId,
                        criterion_id: action.criterionId,
                        metadata: { ...metadata, owner_email: action.recipientEmail },
                    });
                }
            } catch (err: unknown) {
                failures.push({
                    label: `${action.launchName} / ${action.label}`,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
            today,
            launches_considered: launches.length,
            planned: actions.length,
            sent,
            edited,
            failed: failures.length,
            failures,
        });
    } catch (error: unknown) {
        console.error('launch-notifications job error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                duration_ms: Date.now() - startTime,
            },
            { status: 500 }
        );
    }
}
