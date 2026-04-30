/**
 * Scheduled job: Weekly Release Readiness Status Update
 * Builds digest data, generates LLM narrative, and sends a draft DM to the validator (agrunwald@clearcompany.com).
 * The digest is only posted to the channel when the validator clicks "Approve and send" in the DM.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { createAdminClient } from '@/lib/supabase/server';
import { getSlackClient, isChannelForbidden } from '@/lib/slack/client';
import { generateDigestNarrative } from '@/lib/ai/client';
import { buildLeadershipDigestMessage } from '@/lib/slack/templates';
import { getSlackTheme } from '@/lib/slack/theme';
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

        // Get more releases to ensure we don't miss important ones (especially those with delays)
        // We'll still show top 2 in the digest, but having more helps prioritize releases with issues
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

        const approveUrl = BASE_URL ? `${BASE_URL.replace(/\/$/, '')}/api/jobs/weekly-digest/approve?token=${token}` : '';

        if (skipValidation && approveUrl) {
            const { data: settings } = await supabase
                .from('app_settings')
                .select('slack_channels, slack_default_channel')
                .single();
            const slackChannels = settings?.slack_channels || {};
            let channel =
                slackChannels.weekly_digest ||
                settings?.slack_default_channel ||
                process.env.SLACK_DEFAULT_CHANNEL;
            if (channel && isChannelForbidden(channel)) {
                channel = process.env.SLACK_DEFAULT_CHANNEL || undefined;
            }
            if (channel) {
                const { sendSlackNotification } = await import('@/lib/slack/notifications');
                await sendSlackNotification({
                    type: 'weekly_digest',
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

        // Build the full digest message using the same function as the final digest
        const theme = await getSlackTheme();
        const digestMessage = buildLeadershipDigestMessage(
            {
                week_of: weekOf,
                narrative: narrative ?? null,
                last_releases: lastReleasesAnalytics,
                next_releases: nextReleasesAnalytics,
            },
            theme
        );

        // Build draft blocks: add draft header, then all digest content, then approval buttons
        const blocks: Array<{ type: string; text?: { type: string; text: string }; elements?: unknown[] }> = [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*📋 Weekly Release Readiness Status Update – Draft*\nReview the content below. Approve to post the full digest to the channel.',
                },
            },
        ];

        // Add all digest blocks (skip only the header, keep "Week of" context and everything else)
        const digestBlocks = digestMessage.blocks;
        // Skip first block (header), keep everything else including "Week of" context, narrative, and all release details
        for (let i = 1; i < digestBlocks.length; i++) {
            blocks.push(digestBlocks[i] as any);
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
            text: narrative?.trim() || 'Weekly Release Readiness Status Update draft. Approve and send digest via the link.',
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
        console.error('Weekly Release Readiness Status Update job error:', err);
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
