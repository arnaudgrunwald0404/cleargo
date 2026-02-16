/**
 * Scheduled job: Weekly Release Readiness Digest
 * Builds digest data, generates LLM narrative, and sends a draft DM to the validator (agrunwald@clearcompany.com).
 * The digest is only posted to the channel when the validator clicks "Approve and send" in the DM.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { createAdminClient } from '@/lib/supabase/server';
import { getSlackClient, isChannelForbidden } from '@/lib/slack/client';
import { generateDigestNarrative } from '@/lib/ai/client';
import {
    getLastNReleases,
    getNextNReleases,
    getLastReleaseAnalytics,
    getNextReleaseAnalytics,
} from '@/lib/services/releaseAnalyticsService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALIDATOR_EMAIL = process.env.DIGEST_VALIDATOR_EMAIL || 'agrunwald@clearcompany.com';
const SECRET = process.env.CRON_SECRET || process.env.SLACK_SIGNING_SECRET || 'digest-approve-fallback';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || '';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const skipValidation = searchParams.get('send_directly') === 'true';

        if (!skipValidation) {
            const authHeader = request.headers.get('authorization');
            const cronSecret = process.env.CRON_SECRET;
            if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const supabase = createAdminClient();
        const now = new Date();
        const weekOf = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        const lastReleases = await getLastNReleases(2, supabase);
        const nextReleases = await getNextNReleases(2, supabase);
        const lastReleasesAnalytics = await Promise.all(
            lastReleases.map((r) => getLastReleaseAnalytics(r.release_name, r.launch_date, supabase))
        );
        const nextReleasesAnalytics = await Promise.all(
            nextReleases.map((r) => getNextReleaseAnalytics(r.release_name, r.launch_date, supabase))
        );

        const narrativeInput = {
            week_of: weekOf,
            last_releases: lastReleasesAnalytics.map((r) => ({
                release_name: r.release_name,
                launch_date: r.launch_date,
                average_readiness: r.average_readiness,
                metrics_count: r.metrics_count,
                high_risk_epics: r.high_risk_epics?.map((e) => ({ name: e.name, tier: e.tier, risk_level: e.risk_level })),
            })),
            next_releases: nextReleasesAnalytics.map((r) => ({
                release_name: r.release_name,
                launch_date: r.launch_date,
                readiness_status: r.readiness_status,
                high_risk_epics: r.high_risk_epics?.map((e) => ({ name: e.name, tier: e.tier, risk_level: e.risk_level })),
            })),
        };
        const narrative = await generateDigestNarrative(narrativeInput);

        const token = await new SignJWT({ narrative: narrative ?? null })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(SECRET));

        const approveUrl = BASE_URL ? `${BASE_URL.replace(/\/$/, '')}/api/jobs/leadership-digest/approve?token=${token}` : '';

        if (skipValidation && approveUrl) {
            const { data: settings } = await supabase
                .from('app_settings')
                .select('slack_channels, slack_default_channel')
                .single();
            const slackChannels = settings?.slack_channels || {};
            let channel =
                slackChannels.leadership_digest ||
                settings?.slack_default_channel ||
                process.env.SLACK_DEFAULT_CHANNEL;
            if (channel && isChannelForbidden(channel)) {
                channel = process.env.SLACK_DEFAULT_CHANNEL || undefined;
            }
            if (channel) {
                const { sendSlackNotification } = await import('@/lib/slack/notifications');
                await sendSlackNotification({
                    type: 'leadership_digest',
                    priority: 'low',
                    channel,
                    metadata: {
                        week_of: weekOf,
                        narrative: narrative ?? undefined,
                        last_releases: lastReleasesAnalytics,
                        next_releases: nextReleasesAnalytics,
                    },
                });
                return NextResponse.json({
                    success: true,
                    message: 'Digest sent directly to channel (send_directly=true)',
                    details: { channel },
                });
            }
        }

        const client = getSlackClient();
        const slackUser = await client.getUserByEmail(VALIDATOR_EMAIL);
        if (!slackUser?.user?.id) {
            return NextResponse.json(
                { error: `Validator Slack user not found for ${VALIDATOR_EMAIL}` },
                { status: 500 }
            );
        }
        const dmChannel = await client.openConversation(slackUser.user.id);

        // Build summary of epic-level data for the draft
        const buildEpicSummary = () => {
            const lines: string[] = [];
            
            if (lastReleasesAnalytics.length > 0) {
                lines.push('*📚 Last Releases:*');
                lastReleasesAnalytics.forEach((r) => {
                    const launchDateStr = r.launch_date
                        ? new Date(r.launch_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : 'Date TBD';
                    lines.push(`• ${r.release_name} (${launchDateStr}): ${r.average_readiness}% avg readiness, ${r.metrics_count} metrics`);
                    if (r.high_risk_epics && r.high_risk_epics.length > 0) {
                        const highRiskNames = r.high_risk_epics.slice(0, 3).map(e => e.name).join(', ');
                        lines.push(`  High risk: ${highRiskNames}${r.high_risk_epics.length > 3 ? '...' : ''}`);
                    }
                });
            }
            
            if (nextReleasesAnalytics.length > 0) {
                lines.push('\n*🚀 Next Releases:*');
                nextReleasesAnalytics.forEach((r) => {
                    const launchDateStr = r.launch_date
                        ? new Date(r.launch_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : 'Date TBD';
                    const breakdown = r.readiness_breakdown;
                    const totalEpics = breakdown.go + breakdown.conditional_go + breakdown.no_go + breakdown.not_evaluated;
                    lines.push(`• ${r.release_name} (${launchDateStr}): ${r.readiness_status}`);
                    if (totalEpics > 0) {
                        lines.push(`  ${breakdown.go} Go, ${breakdown.conditional_go} Conditional, ${breakdown.no_go} No-Go, ${breakdown.not_evaluated} Not evaluated`);
                    }
                    if (r.high_risk_epics && r.high_risk_epics.length > 0) {
                        const highRiskNames = r.high_risk_epics.slice(0, 3).map(e => e.name).join(', ');
                        lines.push(`  High risk: ${highRiskNames}${r.high_risk_epics.length > 3 ? '...' : ''}`);
                    }
                    if (r.total_criteria_overdue && r.total_criteria_overdue > 0) {
                        lines.push(`  ${r.total_criteria_overdue} criteria overdue`);
                    }
                });
            }
            
            return lines.join('\n');
        };

        const blocks: Array<{ type: string; text?: { type: string; text: string }; elements?: unknown[] }> = [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Weekly Release Readiness Digest – Draft*\nReview the narrative below. Approve to post the full digest to the channel.',
                },
            },
        ];
        
        // Add narrative section
        if (narrative?.trim()) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Narrative:*\n${narrative.trim()}`,
                },
            });
        } else {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Narrative:*\n_No narrative generated (LLM not configured or failed)._',
                },
            });
        }
        
        // Always include epic-level summary
        const epicSummary = buildEpicSummary();
        if (epicSummary) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Epic Summary:*\n${epicSummary}`,
                },
            });
        }
        if (approveUrl) {
            const editUrl = `${approveUrl}${approveUrl.includes('?') ? '&' : '?'}edit=1`;
            blocks.push({
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Approve and send digest', emoji: true },
                        style: 'primary',
                        url: approveUrl,
                    },
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Edit narrative then send', emoji: true },
                        url: editUrl,
                    },
                ],
            });
        }

        await client.postMessage({
            channel: dmChannel,
            text: narrative?.trim() || 'Weekly Release Readiness Digest draft. Approve and send digest via the link.',
            blocks,
        });

        return NextResponse.json({
            success: true,
            message: 'Draft sent to validator; digest will be sent when they approve.',
            details: {
                validator_email: VALIDATOR_EMAIL,
                last_count: lastReleasesAnalytics.length,
                next_count: nextReleasesAnalytics.length,
                has_narrative: !!narrative,
            },
        });
    } catch (err: any) {
        console.error('Weekly Release Readiness Digest job error:', err);
        return NextResponse.json(
            { error: err?.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

// Also support POST for manual triggering (e.g. send_directly: true to skip validation and post to channel)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const url = new URL(request.url);
        if (body.send_directly) {
            url.searchParams.set('send_directly', 'true');
        }
        return GET(new NextRequest(url, { method: 'GET', headers: request.headers }));
    } catch (error: any) {
        return GET(request);
    }
}
