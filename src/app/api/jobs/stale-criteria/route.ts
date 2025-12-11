/**
 * Scheduled job: Check for stale criteria and send nudges
 * Runs daily to remind decision owners about criteria not updated recently
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendSlackNotification } from '@/lib/slack/notifications';

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

        // Get stale criterion threshold from settings
        const { data: settings } = await supabase
            .from('app_settings')
            .select('stale_criterion_days')
            .single();

        const staleDays = settings?.stale_criterion_days || 14;
        const staleDate = new Date();
        staleDate.setDate(staleDate.getDate() - staleDays);

        // Query stale criteria with their associated launch and decision owner info
        const { data: staleCriteria, error } = await supabase
            .from('epic_criterion_status')
            .select(`
                id,
                status,
                last_updated_at,
                notes,
                criterion:criterion_id (
                    id,
                    label,
                    gate
                ),
                epic:epic_id (
                    id,
                    name,
                    tier,
                    target_launch_date,
                    console_url
                ),
                decision_owner:decision_owner_id (
                    id,
                    email,
                    first_name,
                    last_name,
                    slack_handle
                )
            `)
            .lt('last_updated_at', staleDate.toISOString())
            .in('status', ['NOT_SET', 'CONDITIONAL']) // Only nudge for incomplete statuses
            .not('epic_id', 'is', null);

        if (error) {
            console.error('Error fetching stale criteria:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!staleCriteria || staleCriteria.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No stale criteria found',
                count: 0
            });
        }

        // Filter out criteria for inactive launches
        const activeCriteria = staleCriteria.filter((c: any) => {
            // Add logic to filter by launch status if you have a status field
            return c.epic && c.decision_owner;
        });

        // Send notifications
        const notifications = [];
        const errors = [];

        for (const criterion of activeCriteria) {
            const daysSinceUpdate = Math.floor(
                (Date.now() - new Date(criterion.last_updated_at).getTime()) / (1000 * 60 * 60 * 24)
            );

            // Supabase returns arrays for foreign key relations, so we need to access the first element
            const epic = Array.isArray(criterion.epic) ? criterion.epic[0] : criterion.epic;
            const criterionData = Array.isArray(criterion.criterion) ? criterion.criterion[0] : criterion.criterion;
            const decisionOwner = Array.isArray(criterion.decision_owner) ? criterion.decision_owner[0] : criterion.decision_owner;

            if (!epic || !criterionData || !decisionOwner) {
                console.warn(`Skipping criterion ${criterion.id} due to missing related data`);
                continue;
            }

            try {
                await sendSlackNotification({
                    type: 'stale_criterion',
                    priority: 'medium',
                    launch_id: epic.id,
                    recipient: {
                        id: decisionOwner.id,
                        name: `${decisionOwner.first_name} ${decisionOwner.last_name}`,
                        email: decisionOwner.email,
                        slack_handle: decisionOwner.slack_handle,
                    },
                    metadata: {
                        launch_name: epic.name,
                        launch_id: epic.id,
                        criterion_label: criterionData.label,
                        criterion_id: criterionData.id,
                        days_stale: daysSinceUpdate,
                        last_updated: criterion.last_updated_at,
                        decision_owner_name: `${decisionOwner.first_name} ${decisionOwner.last_name}`,
                    },
                });

                notifications.push({
                    criterion_id: criterion.id,
                    decision_owner: decisionOwner.email,
                    days_stale: daysSinceUpdate,
                });
            } catch (err: any) {
                console.error(`Failed to send notification for criterion ${criterion.id}:`, err);
                errors.push({
                    criterion_id: criterion.id,
                    error: err.message,
                });
            }
        }

        return NextResponse.json({
            success: true,
            message: `Processed ${activeCriteria.length} stale criteria`,
            notifications_sent: notifications.length,
            errors: errors.length,
            details: {
                notifications,
                errors,
            },
        });
    } catch (error: any) {
        console.error('Stale criteria job error:', error);
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
