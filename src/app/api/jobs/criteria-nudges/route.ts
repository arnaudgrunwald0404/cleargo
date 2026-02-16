/**
 * Scheduled job: Send nudge notifications for criteria based on due dates
 * Runs daily to remind decision owners about criteria approaching or past due dates
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendSlackNotification, syncUserSlackHandle, canReceiveSlackNotification } from '@/lib/slack/notifications';
import { groupCriteriaByEpicDueDateAndAssignee } from '@/lib/slack/notification-groups';
import { buildCriteriaNudgeMessage } from '@/lib/slack/templates';
import { getSettings } from '@/lib/settings-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for job execution

export async function GET(request: NextRequest) {
    try {
        // Verify this is a legitimate cron request (optional: add auth header check)
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createClient();
        const settings = await getSettings();

        // Get nudge frequency settings
        const nudge1WeekBefore = settings.slack_nudge_1_week_before ?? true;
        const nudgeOnDueDate = settings.slack_nudge_on_due_date ?? true;
        const nudgeDailyAfter = settings.slack_nudge_daily_after_due ?? true;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        const oneWeekFromNow = new Date(today);
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
        const oneWeekFromNowStr = oneWeekFromNow.toISOString().split('T')[0];

        // Build query conditions for criteria that need nudging
        const conditions: string[] = [];

        if (nudge1WeekBefore) {
            conditions.push(`condition_due_date.eq.${oneWeekFromNowStr}`);
        }

        if (nudgeOnDueDate) {
            conditions.push(`condition_due_date.eq.${todayStr}`);
        }

        if (nudgeDailyAfter) {
            conditions.push(`condition_due_date.lt.${todayStr}`);
        }

        if (conditions.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No nudge types enabled',
                count: 0,
            });
        }

        // Query criteria that match nudge conditions
        // We'll need to query separately for each condition type since Supabase doesn't support OR queries easily
        const allCriteria: any[] = [];

        if (nudge1WeekBefore) {
            const { data: weekBeforeCriteria, error: weekError } = await supabase
                .from('epic_criterion_status')
                .select(
                    `
                    id,
                    epic_id,
                    criterion_id,
                    decision_owner_id,
                    condition_due_date,
                    status,
                    last_nudge_sent_at,
                    criterion:criterion_id (
                        label,
                        category
                    ),
                    epic:epic_id (
                        name
                    ),
                    decision_owner:decision_owner_id (
                        id,
                        email,
                        first_name,
                        last_name,
                        slack_handle
                    )
                `
                )
                .eq('condition_due_date', oneWeekFromNowStr)
                .in('status', ['NOT_SET', 'CONDITIONAL'])
                .not('decision_owner_id', 'is', null)
                .or(`last_nudge_sent_at.is.null,last_nudge_sent_at.lt.${todayStr}`);

            if (weekError) {
                console.error('Error fetching 1-week-before criteria:', weekError);
            } else if (weekBeforeCriteria) {
                allCriteria.push(
                    ...weekBeforeCriteria.map((c: any) => ({ ...c, nudgeType: '1_week_before' }))
                );
            }
        }

        if (nudgeOnDueDate) {
            const { data: dueDateCriteria, error: dueError } = await supabase
                .from('epic_criterion_status')
                .select(
                    `
                    id,
                    epic_id,
                    criterion_id,
                    decision_owner_id,
                    condition_due_date,
                    status,
                    last_nudge_sent_at,
                    criterion:criterion_id (
                        label,
                        category
                    ),
                    epic:epic_id (
                        name
                    ),
                    decision_owner:decision_owner_id (
                        id,
                        email,
                        first_name,
                        last_name,
                        slack_handle
                    )
                `
                )
                .eq('condition_due_date', todayStr)
                .in('status', ['NOT_SET', 'CONDITIONAL'])
                .not('decision_owner_id', 'is', null)
                .or(`last_nudge_sent_at.is.null,last_nudge_sent_at.lt.${todayStr}`);

            if (dueError) {
                console.error('Error fetching due-date criteria:', dueError);
            } else if (dueDateCriteria) {
                allCriteria.push(...dueDateCriteria.map((c: any) => ({ ...c, nudgeType: 'on_due_date' })));
            }
        }

        if (nudgeDailyAfter) {
            // For daily after nudges, only include criteria that haven't been nudged today
            // or haven't been nudged at all (last_nudge_sent_at is null)
            const { data: overdueCriteria, error: overdueError } = await supabase
                .from('epic_criterion_status')
                .select(
                    `
                    id,
                    epic_id,
                    criterion_id,
                    decision_owner_id,
                    condition_due_date,
                    status,
                    last_nudge_sent_at,
                    criterion:criterion_id (
                        label,
                        category
                    ),
                    epic:epic_id (
                        name
                    ),
                    decision_owner:decision_owner_id (
                        id,
                        email,
                        first_name,
                        last_name,
                        slack_handle
                    )
                `
                )
                .lt('condition_due_date', todayStr)
                .in('status', ['NOT_SET', 'CONDITIONAL'])
                .not('decision_owner_id', 'is', null)
                .or(`last_nudge_sent_at.is.null,last_nudge_sent_at.lt.${todayStr}`);

            if (overdueError) {
                console.error('Error fetching overdue criteria:', overdueError);
            } else if (overdueCriteria) {
                allCriteria.push(...overdueCriteria.map((c: any) => ({ ...c, nudgeType: 'daily_after' })));
            }
        }

        if (allCriteria.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No criteria need nudging',
                count: 0,
            });
        }

        // Log all notifications before filtering
        const notificationsByEmail = new Map<string, any[]>();
        for (const c of allCriteria) {
            const ownerEmail = c.decision_owner?.email?.toLowerCase() || 'unknown';
            if (!notificationsByEmail.has(ownerEmail)) {
                notificationsByEmail.set(ownerEmail, []);
            }
            notificationsByEmail.get(ownerEmail)!.push({
                criterion_id: c.criterion_id,
                criterion_label: c.criterion?.label,
                epic_name: c.epic?.name,
                due_date: c.condition_due_date,
                nudge_type: c.nudgeType,
                assignee_email: ownerEmail,
                assignee_name: `${c.decision_owner?.first_name || ''} ${c.decision_owner?.last_name || ''}`.trim() || ownerEmail,
                has_slack_handle: !!c.decision_owner?.slack_handle,
            });
        }

        const uniqueEmails = Array.from(notificationsByEmail.keys()).filter(e => e !== 'unknown');
        const allowedForSlack = new Set<string>();
        for (const email of uniqueEmails) {
            if (await canReceiveSlackNotification(email)) allowedForSlack.add(email);
        }

        console.log('📋 Slack Nudge Notifications - ALL NOTIFICATIONS (before filtering):');
        console.log(`   Total criteria needing nudges: ${allCriteria.length}`);
        console.log(`   Slack recipients: per-user flag in User Management (${allowedForSlack.size} user(s) enabled)`);
        for (const [email, criteria] of notificationsByEmail.entries()) {
            const firstCriterion = allCriteria.find((c: any) =>
                c.decision_owner?.email?.toLowerCase() === email
            );
            const slackHandle = firstCriterion?.decision_owner?.slack_handle;
            const willSend = allowedForSlack.has(email);
            const status = willSend ? '✅ WILL SEND' : '📝 LOGGED ONLY';
            const nudgeTypes = [...new Set(criteria.map((c) => c.nudge_type))];
            console.log(`   ${status} - ${email} (Slack: ${slackHandle || 'none'}): ${criteria.length} criteria (${nudgeTypes.join(', ')})`);
            if (criteria.length <= 5) {
                criteria.forEach((c) => {
                    console.log(`      - ${c.criterion_label} (${c.epic_name}) - ${c.nudge_type} - Due: ${c.due_date}`);
                });
            } else {
                console.log(`      ... ${criteria.length} criteria (showing first 3)`);
                criteria.slice(0, 3).forEach((c) => {
                    console.log(`      - ${c.criterion_label} (${c.epic_name}) - ${c.nudge_type} - Due: ${c.due_date}`);
                });
            }
        }

        const filteredCriteria = allCriteria.filter((c: any) => {
            const ownerEmail = c.decision_owner?.email?.toLowerCase();
            return ownerEmail && allowedForSlack.has(ownerEmail);
        });

        if (filteredCriteria.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No assignees have Slack notifications enabled in User Management (all notifications logged)',
                count: 0,
                debug: {
                    total_before_filter: allCriteria.length,
                    notifications_by_email: Object.fromEntries(
                        Array.from(notificationsByEmail.entries()).map(([email, criteria]) => [
                            email,
                            {
                                count: criteria.length,
                                nudge_types: [...new Set(criteria.map((c) => c.nudge_type))],
                            },
                        ])
                    ),
                },
            });
        }

        console.log(`✅ Sending notifications to ${filteredCriteria.length} criteria (${allCriteria.length} total were logged)`);

        console.log(`✅ After filter: ${filteredCriteria.length} criteria will receive nudges`);

        // Group by epic, due date, and assignee (and nudge type for daily_after)
        const groupedByNudgeType = new Map<string, any[]>();
        for (const criterion of filteredCriteria) {
            const key = criterion.nudgeType;
            if (!groupedByNudgeType.has(key)) {
                groupedByNudgeType.set(key, []);
            }
            groupedByNudgeType.get(key)!.push(criterion);
        }

        const notificationsSent: any[] = [];
        const errors: any[] = [];

        // Helper function to add delay between notifications
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // Process each nudge type
        for (const [nudgeType, criteria] of groupedByNudgeType.entries()) {
            // Group by epic, due date, and assignee
            const grouped = groupCriteriaByEpicDueDateAndAssignee(criteria);

            let notificationCount = 0;
            for (const [key, group] of grouped.entries()) {
                // Add delay between notifications to avoid rate limiting (500ms between each)
                if (notificationCount > 0) {
                    await delay(500);
                }
                if (!group.assignee_slack_handle) {
                    // Try to sync Slack handle before skipping
                    console.log(`Attempting to sync Slack handle for ${group.assignee_email}...`);
                    const syncedHandle = await syncUserSlackHandle(group.assignee_email);
                    
                    if (syncedHandle) {
                        // Update the group with the synced handle
                        group.assignee_slack_handle = syncedHandle;
                        console.log(`Successfully synced Slack handle for ${group.assignee_email}: ${syncedHandle}`);
                    } else {
                        console.log(`Skipping nudge for ${group.assignee_email} - no Slack handle found`);
                        continue;
                    }
                }

                try {
                    const epicUrl = process.env.NEXT_PUBLIC_APP_URL
                        ? `${process.env.NEXT_PUBLIC_APP_URL}/epics/${group.epic_id}`
                        : undefined;

                    await sendSlackNotification({
                        type: 'criteria_nudge',
                        priority: nudgeType === 'daily_after' ? 'high' : 'medium',
                        recipient: {
                            id: group.assignee_id,
                            email: group.assignee_email,
                            slack_handle: group.assignee_slack_handle,
                            name: group.assignee_name,
                        },
                        launch_id: group.epic_id,
                        metadata: {
                            epic_name: group.epic_name,
                            epic_id: group.epic_id,
                            criteria_count: group.criteria.length,
                            criteria: group.criteria.map((c) => ({
                                id: c.id,
                                label: c.label,
                                category: c.category,
                                due_date: c.due_date,
                            })),
                            nudge_type: nudgeType,
                            epic_url: epicUrl,
                        },
                    });

                    // Update last_nudge_sent_at for all criteria in this group
                    const criterionIds = group.criteria.map((c) => c.id);
                    const { error: updateError } = await supabase
                        .from('epic_criterion_status')
                        .update({ last_nudge_sent_at: todayStr })
                        .in('id', criterionIds);

                    if (updateError) {
                        console.error(`Failed to update last_nudge_sent_at for criteria:`, updateError);
                        // Continue anyway - notification was sent
                    }

                    notificationsSent.push({
                        epic_id: group.epic_id,
                        assignee_email: group.assignee_email,
                        nudge_type: nudgeType,
                        criteria_count: group.criteria.length,
                    });

                    notificationCount++;
                    console.log(
                        `Sent ${nudgeType} nudge to ${group.assignee_email} for ${group.criteria.length} criteria in ${group.epic_name} (${notificationCount}/${grouped.size})`
                    );
                } catch (error: any) {
                    console.error(`Failed to send nudge to ${group.assignee_email}:`, error);
                    errors.push({
                        epic_id: group.epic_id,
                        assignee_email: group.assignee_email,
                        nudge_type: nudgeType,
                        error: error.message,
                    });
                    notificationCount++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `Processed ${filteredCriteria.length} criteria needing nudges`,
            notifications_sent: notificationsSent.length,
            errors: errors.length,
            details: {
                notifications: notificationsSent,
                errors,
            },
            debug: {
                total_before_filter: allCriteria.length,
                filtered_count: filteredCriteria.length,
                notifications_by_email: Object.fromEntries(
                    Array.from(notificationsByEmail.entries()).map(([email, criteria]) => {
                        const firstCriterion = allCriteria.find((c: any) =>
                            c.decision_owner?.email?.toLowerCase() === email
                        );
                        const slackHandle = firstCriterion?.decision_owner?.slack_handle;
                        const willSend = allowedForSlack.has(email);
                        return [
                            email,
                            {
                                count: criteria.length,
                                nudge_types: [...new Set(criteria.map((c) => c.nudge_type))],
                                slack_handle: slackHandle || null,
                                will_send: willSend,
                            },
                        ];
                    })
                ),
            },
        });
    } catch (error: any) {
        console.error('Criteria nudge job error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
    return GET(request);
}

