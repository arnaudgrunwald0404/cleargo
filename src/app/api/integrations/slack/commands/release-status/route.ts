/**
 * Slack slash command: /release-status
 * Get the current status of a specific release
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest, extractSlackHeaders } from '@/lib/slack/verify';
import { formatDateOnlyForDisplay, parseDateOnlyLocal } from '@/lib/date-utils';
import type { SlackCommandPayload, SlackBlock } from '@/types/slack';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.netlify.app';

export async function POST(request: NextRequest) {
    try {
        // Get raw body for signature verification
        const body = await request.text();
        const { timestamp, signature } = extractSlackHeaders(request);

        // Verify request is from Slack
        if (!timestamp || !signature) {
            return NextResponse.json({ error: 'Missing Slack headers' }, { status: 400 });
        }

        if (!verifySlackRequest(body, timestamp, signature, SLACK_SIGNING_SECRET)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        // Parse form data
        const formData = new URLSearchParams(body);
        const payload: SlackCommandPayload = {
            token: formData.get('token') || '',
            team_id: formData.get('team_id') || '',
            team_domain: formData.get('team_domain') || '',
            channel_id: formData.get('channel_id') || '',
            channel_name: formData.get('channel_name') || '',
            user_id: formData.get('user_id') || '',
            user_name: formData.get('user_name') || '',
            command: formData.get('command') || '',
            text: formData.get('text') || '',
            api_app_id: formData.get('api_app_id') || '',
            response_url: formData.get('response_url') || '',
            trigger_id: formData.get('trigger_id') || '',
        };

        const searchTerm = payload.text.trim();

        if (!searchTerm) {
            return NextResponse.json({
                response_type: 'ephemeral',
                text: 'Please provide a release name or Aha ID. Example: `/release-status HIRE-123`',
            });
        }

        // Query release by name or Aha ID
        const supabase = (await import('@/lib/supabase/server')).createClient();

        const { data: releases, error: releaseError } = await supabase
            .from('epic')
            .select('id, name, aha_reference_num, tier, readiness_status, readiness_score, risk_level, target_launch_date')
            .or(`name.ilike.%${searchTerm}%,aha_reference_num.ilike.%${searchTerm}%`)
            .limit(5);

        if (releaseError) {
            console.error('Error fetching release:', releaseError);
            return NextResponse.json({
                response_type: 'ephemeral',
                text: `❌ Error searching for release: ${releaseError.message}`,
            });
        }

        if (!releases || releases.length === 0) {
            return NextResponse.json({
                response_type: 'ephemeral',
                text: `🔍 No releases found matching "${searchTerm}"`,
            });
        }

        // If multiple matches, show list
        if (releases.length > 1) {
            const blocks: SlackBlock[] = [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `Found ${releases.length} releases matching "${searchTerm}":`,
                    },
                },
                { type: 'divider' },
            ];

            for (const release of releases) {
                const statusEmoji = release.readiness_status === 'GO' ? '✅' :
                    release.readiness_status === 'CONDITIONAL_GO' ? '⚠️' : '❌';

                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `${statusEmoji} *${release.name}*\nAha ID: ${release.aha_reference_num || 'N/A'} | Tier: ${release.tier}`,
                    },
                    accessory: {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View',
                            emoji: true,
                        },
                        url: `${APP_URL}/epics/${release.id}`,
                    },
                });
            }

            return NextResponse.json({
                response_type: 'ephemeral',
                blocks,
            });
        }

        // Single match - show detailed status
        const release = releases[0];

        // Get gate criteria summary
        const { data: gateStatuses } = await supabase
            .from('epic_criterion_status')
            .select(`
                status,
                criterion:criterion_id (
                    gate
                )
            `)
            .eq('epic_id', release.id);

        const gates = (gateStatuses || []).filter((s: any) => {
            const criterion = Array.isArray(s.criterion) ? s.criterion[0] : s.criterion;
            return criterion?.gate === true;
        });

        const gateGo = gates.filter((g: any) => g.status === 'GO').length;
        const gateTotal = gates.length;

        const statusEmoji = release.readiness_status === 'GO' ? '✅' :
            release.readiness_status === 'CONDITIONAL_GO' ? '⚠️' : '❌';
        const riskEmoji = release.risk_level === 'HIGH' ? '🔴' :
            release.risk_level === 'MEDIUM' ? '🟡' : '🟢';
        const score = release.readiness_score ? Math.round(release.readiness_score * 100) : 0;

        const targetDate = release.target_launch_date
            ? formatDateOnlyForDisplay(release.target_launch_date, { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Not set';

        const daysToTarget = (() => {
            if (!release.target_launch_date) return null;
            const targetDay = parseDateOnlyLocal(release.target_launch_date);
            if (!targetDay) return null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            targetDay.setHours(0, 0, 0, 0);
            return Math.ceil((targetDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        })();

        const daysText = daysToTarget !== null
            ? daysToTarget > 0 ? `(${daysToTarget} days away)` : `(${Math.abs(daysToTarget)} days overdue)`
            : '';

        return NextResponse.json({
            response_type: 'ephemeral',
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: release.name,
                        emoji: true,
                    },
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*Aha ID:*\n${release.aha_reference_num || 'N/A'}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Tier:*\n${release.tier}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Status:*\n${statusEmoji} ${release.readiness_status}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Risk:*\n${riskEmoji} ${release.risk_level}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Readiness Score:*\n${score}%`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Target Date:*\n${targetDate} ${daysText}`,
                        },
                    ],
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Gate Criteria:* ${gateGo}/${gateTotal} GO`,
                    },
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'View Full Details',
                                emoji: true,
                            },
                            url: `${APP_URL}/epics/${release.id}`,
                            style: 'primary',
                        },
                    ],
                },
            ],
        });
    } catch (error) {
        console.error('Slack command error:', error);
        return NextResponse.json({
            response_type: 'ephemeral',
            text: 'Sorry, an error occurred while processing your request.',
        });
    }
}
