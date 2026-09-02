/**
 * Slack slash command: /my-releases
 * View releases you own or are involved with
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest, extractSlackHeaders } from '@/lib/slack/verify';
import type { SlackCommandPayload } from '@/types/slack';

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

        // Look up user by Slack user_id.
        //
        // Admin client, not the RLS one: `app_user` requires an authenticated
        // role to read and a slash command carries no session, so this always
        // found nobody and the command always answered "I couldn't find your
        // account linked to this Slack user."
        const supabase = (await import('@/lib/supabase/server')).createAdminClient();

        const { data: appUser, error: userError } = await supabase
            .from('app_user')
            .select('id, email, first_name, last_name')
            .eq('slack_handle', payload.user_id)
            .maybeSingle();

        if (userError || !appUser) {
            return NextResponse.json({
                response_type: 'ephemeral',
                text: `👋 Hi! I couldn't find your account linked to this Slack user. Please make sure your Slack handle is synced in the Release Console.`,
            });
        }

        // Query releases where user is owner
        const { data: ownedReleases, error: releasesError } = await supabase
            .from('epic')
            .select('id, name, tier, readiness_status, readiness_score, risk_level, target_launch_date')
            .eq('owner_id', appUser.id)
            .order('target_launch_date', { ascending: true })
            .limit(5);

        // Query criteria where user is decision owner
        const { data: criteriaStatuses, error: criteriaError } = await supabase
            .from('epic_criterion_status')
            .select(`
                id,
                status,
                last_updated_at,
                epic:epic_id (
                    id,
                    name
                ),
                criterion:criterion_id (
                    id,
                    label
                )
            `)
            .eq('decision_owner_id', appUser.id)
            .in('status', ['NOT_SET', 'CONDITIONAL'])
            .limit(5);

        const releases = ownedReleases || [];
        const criteria = criteriaStatuses || [];

        // Build response blocks
        const blocks: any[] = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `🚀 My Releases`,
                    emoji: true,
                },
            },
        ];

        // Add owned releases section
        if (releases.length > 0) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Releases you own:*',
                },
            });

            for (const release of releases) {
                const statusEmoji = release.readiness_status === 'GO' ? '✅' :
                    release.readiness_status === 'CONDITIONAL_GO' ? '⚠️' : '❌';
                const riskEmoji = release.risk_level === 'HIGH' ? '🔴' :
                    release.risk_level === 'MEDIUM' ? '🟡' : '🟢';
                const score = release.readiness_score ? Math.round(release.readiness_score * 100) : 0;

                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `${statusEmoji} *${release.name}* (${release.tier})\n${riskEmoji} Risk: ${release.risk_level} | Score: ${score}%`,
                    },
                    accessory: {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View Details',
                            emoji: true,
                        },
                        url: `${APP_URL}/epics/${release.id}`,
                    },
                });
            }
        } else {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '_You don\'t own any releases yet._',
                },
            });
        }

        blocks.push({ type: 'divider' });

        // Add criteria section
        if (criteria.length > 0) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Criteria awaiting your decision (${criteria.length}):*`,
                },
            });

            for (const criterion of criteria) {
                const epic = Array.isArray(criterion.epic) ? criterion.epic[0] : criterion.epic;
                const criterionData = Array.isArray(criterion.criterion) ? criterion.criterion[0] : criterion.criterion;

                if (epic && criterionData) {
                    const daysSinceUpdate = Math.floor(
                        (Date.now() - new Date(criterion.last_updated_at).getTime()) / (1000 * 60 * 60 * 24)
                    );
                    const staleIndicator = daysSinceUpdate > 14 ? '⏰ ' : '';

                    blocks.push({
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `${staleIndicator}*${criterionData.label}*\nRelease: ${epic.name} | Go/No-Go Score: ${criterion.status}`,
                        },
                    });
                }
            }
        }

        blocks.push({ type: 'divider' });

        // Add action buttons
        blocks.push({
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: 'View Portfolio Dashboard',
                        emoji: true,
                    },
                    url: `${APP_URL}/portfolio`,
                },
            ],
        });

        return NextResponse.json({
            response_type: 'ephemeral',
            blocks,
        });
    } catch (error) {
        console.error('Slack command error:', error);
        return NextResponse.json({
            response_type: 'ephemeral',
            text: 'Sorry, an error occurred while processing your request.',
        });
    }
}
