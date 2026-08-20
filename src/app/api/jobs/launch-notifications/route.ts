/**
 * Launch artifact notifications: state-transition driven, one message per artifact.
 *
 * Deliberately does NOT use sendSlackNotification, for two reasons:
 *  - it returns void, so there is no slack_ts to store, and without that the
 *    next transition cannot edit the existing message and has to post a new one;
 *  - its `launch_id` parameter means an EPIC id (legacy naming from
 *    0018_rename_launch_to_epic.sql) and it hard-skips when that epic's release
 *    is unsynced, which would silently drop every launch notification.
 * So this talks to the Slack client directly and logs with the real
 * notification_log.launch_id / .criterion_id columns.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getSlackClient } from '@/lib/slack/client';
import { canReceiveSlackNotification, logNotification } from '@/lib/slack/notifications';
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

        const slack = getSlackClient();
        let sent = 0;
        let edited = 0;
        let skipped = 0;
        const failures: Array<{ label: string; error: string }> = [];

        for (const action of actions) {
            try {
                if (!(await canReceiveSlackNotification(action.recipientEmail))) {
                    skipped++;
                    continue;
                }

                const copy = describeAction(action);
                const blocks = [
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: `*${copy.text}*\n${copy.detail}` },
                    },
                ];

                if (action.editExisting) {
                    // One message per artifact for its whole life: the earlier
                    // note is rewritten rather than joined by a new one.
                    await slack.updateMessage(
                        action.editExisting.slack_channel,
                        action.editExisting.slack_ts,
                        { text: copy.text, blocks }
                    );
                    await logNotification({
                        gtm_launch_id: action.launchId,
                        criterion_id: action.criterionId,
                        type: LAUNCH_NOTIFY_TYPE,
                        payload: { kind: action.kind, label: action.label, edited: true },
                        delivery_channel: 'slack',
                        status: 'sent',
                        slack_ts: action.editExisting.slack_ts,
                        slack_channel: action.editExisting.slack_channel,
                    });
                    edited++;
                    continue;
                }

                const user = await slack.getUserByEmail(action.recipientEmail);
                const slackUserId = user?.user?.id;
                if (!slackUserId) {
                    skipped++;
                    continue;
                }
                const dm = await slack.openConversation(slackUserId);
                const posted = await slack.postMessage({ channel: dm, text: copy.text, blocks });

                await logNotification({
                    gtm_launch_id: action.launchId,
                    criterion_id: action.criterionId,
                    type: LAUNCH_NOTIFY_TYPE,
                    payload: { kind: action.kind, label: action.label, blocking: action.blocking },
                    delivery_channel: 'slack',
                    status: 'sent',
                    slack_ts: posted.ts,
                    slack_channel: dm,
                });
                sent++;

                // A blocking gate is the only thing that reaches anyone beyond
                // the owner, and it threads off the original so it stays in context.
                for (const escalate of action.escalateTo) {
                    if (!(await canReceiveSlackNotification(escalate))) continue;
                    const eu = await slack.getUserByEmail(escalate);
                    const eid = eu?.user?.id;
                    if (!eid) continue;
                    const edm = await slack.openConversation(eid);
                    await slack.postMessage({
                        channel: edm,
                        text: copy.text,
                        blocks: [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `*${copy.text}*\n${copy.detail}\n_Owner: ${action.recipientEmail}_`,
                                },
                            },
                        ],
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
            skipped,
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
