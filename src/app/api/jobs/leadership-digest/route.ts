/**
 * Scheduled job: Weekly leadership digest
 * Sends a summary of launches to leadership team
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendSlackNotification } from '@/lib/slack/notifications';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
    try {
        // Verify this is a legitimate cron request
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createClient();

        // Get high-risk launches
        const { data: highRiskLaunches, error: highRiskError } = await supabase
            .from('epic')
            .select('id, name, tier, target_launch_date, readiness_score, risk_level')
            .in('risk_level', ['HIGH', 'MEDIUM'])
            .order('risk_level', { ascending: false })
            .order('target_launch_date', { ascending: true })
            .limit(10);

        if (highRiskError) {
            console.error('Error fetching high-risk launches:', highRiskError);
            return NextResponse.json({ error: highRiskError.message }, { status: 500 });
        }

        // Get upcoming launches (next 30 days)
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const { data: upcomingLaunches, error: upcomingError } = await supabase
            .from('epic')
            .select('id, name, tier, target_launch_date')
            .gte('target_launch_date', new Date().toISOString())
            .lte('target_launch_date', thirtyDaysFromNow.toISOString())
            .order('target_launch_date', { ascending: true })
            .limit(10);

        if (upcomingError) {
            console.error('Error fetching upcoming launches:', upcomingError);
        }

        // Get total active launches count
        const { count: totalActive } = await supabase
            .from('epic')
            .select('*', { count: 'exact', head: true })
            .not('readiness_status', 'eq', 'COMPLETED');

        // Format data for the digest
        const highRiskFormatted = (highRiskLaunches || []).map((launch: any) => {
            const daysToLaunch = launch.target_launch_date
                ? Math.ceil((new Date(launch.target_launch_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : 0;

            return {
                name: launch.name,
                id: launch.id,
                tier: launch.tier,
                risk: launch.risk_level,
                days_to_launch: daysToLaunch,
                readiness: Math.round((launch.readiness_score || 0) * 100),
            };
        });

        const upcomingFormatted = (upcomingLaunches || []).map((launch: any) => ({
            name: launch.name,
            id: launch.id,
            tier: launch.tier,
            target_release_date: launch.target_launch_date,
        }));

        // Get the week of date
        const now = new Date();
        const weekOf = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        // Get settings for channel configuration
        const { data: settings } = await supabase
            .from('app_settings')
            .select('slack_channels, slack_default_channel')
            .single();

        const slackChannels = settings?.slack_channels || {};
        const channel = slackChannels.leadership_digest || settings?.slack_default_channel || process.env.SLACK_DEFAULT_CHANNEL;

        // Send the digest
        try {
            await sendSlackNotification({
                type: 'leadership_digest',
                priority: 'low',
                channel,
                metadata: {
                    week_of: weekOf,
                    high_risk_launches: highRiskFormatted,
                    upcoming_launches: upcomingFormatted,
                    total_active: totalActive || 0,
                },
            });

            return NextResponse.json({
                success: true,
                message: 'Leadership digest sent successfully',
                details: {
                    channel,
                    high_risk_count: highRiskFormatted.length,
                    upcoming_count: upcomingFormatted.length,
                    total_active: totalActive || 0,
                },
            });
        } catch (err: any) {
            console.error('Failed to send leadership digest:', err);
            return NextResponse.json(
                { error: 'Failed to send digest', details: err.message },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error('Leadership digest job error:', error);
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
