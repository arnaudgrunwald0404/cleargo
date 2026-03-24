/**
 * Scheduled job: Check for stale criteria and send nudges
 * Runs daily to remind decision owners about criteria not updated recently
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendSlackNotification } from '@/lib/slack/notifications';
import { generateSmartNudge } from '@/lib/ai/client';
import { getEpicCategoryPairsWithUnratedSubcriteria } from '@/lib/services/gateSignoffService';

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
                    gate,
                    category
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

        // Suppress stale nudges for gate criteria whose sub-criteria are not all rated
        const stalledGatePairs = activeCriteria
            .filter((c: any) => {
                const crit = Array.isArray(c.criterion) ? c.criterion[0] : c.criterion;
                return crit?.gate === true;
            })
            .map((c: any) => {
                const crit = Array.isArray(c.criterion) ? c.criterion[0] : c.criterion;
                const epic = Array.isArray(c.epic) ? c.epic[0] : c.epic;
                return { epicId: epic?.id ?? c.epic_id, category: crit.category };
            })
            .filter((p: any) => p.epicId && p.category);
        const activeCriteriaFiltered = stalledGatePairs.length > 0
            ? await (async () => {
                const blockedPairs = await getEpicCategoryPairsWithUnratedSubcriteria(stalledGatePairs, supabase);
                if (blockedPairs.size === 0) return activeCriteria;
                const filtered = activeCriteria.filter((c: any) => {
                    const crit = Array.isArray(c.criterion) ? c.criterion[0] : c.criterion;
                    if (!crit?.gate) return true;
                    const epic = Array.isArray(c.epic) ? c.epic[0] : c.epic;
                    const epicId = epic?.id ?? c.epic_id;
                    return !blockedPairs.has(`${epicId}::${crit.category}`);
                });
                console.log(`[stale-criteria] Gate filter suppressed ${activeCriteria.length - filtered.length} gate criteria with unrated sub-criteria`);
                return filtered;
            })()
            : activeCriteria;

        // Send notifications
        const notifications = [];
        const errors = [];

        for (const criterion of activeCriteriaFiltered) {
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

            // Generate AI Personalized Nudge
            let aiPersonalizedNudge: string | null = null;
            try {
                aiPersonalizedNudge = await generateSmartNudge({
                    launchName: epic.name,
                    criterionLabel: criterionData.label,
                    ownerName: decisionOwner.first_name || decisionOwner.email,
                    statusNotes: criterion.notes || null,
                    daysStale: daysSinceUpdate
                });
                if (aiPersonalizedNudge) {
                    console.log(`🤖 Generated AI nudge for ${decisionOwner.email} on ${criterionData.label}`);
                }
            } catch (aiError) {
                console.warn('AI nudge generation failed (skipping):', aiError);
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
                        ai_personalized_nudge: aiPersonalizedNudge,
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
