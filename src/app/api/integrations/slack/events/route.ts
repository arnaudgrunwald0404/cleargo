/**
 * Slack Events API endpoint
 * Handles incoming events from Slack (app mentions, home opened, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest, extractSlackHeaders } from '@/lib/slack/verify';
import type { SlackEventPayload } from '@/types/slack';
import { getSlackClient } from '@/lib/slack/client';
import { hasCleargoAgentKey } from '@/lib/ai/cleargoAgent';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://launch-console.clearcompany.com';

async function triggerAgentBackground(payload: {
    type: 'app_mention' | 'direct_message';
    message: string;
    channel: string;
    thread_ts?: string;
    userEmail?: string;
}): Promise<void> {
    const baseUrl = (process.env.NETLIFY_URL || process.env.URL || '').replace(/\/$/, '');
    if (!baseUrl || baseUrl.includes('localhost')) return;
    const secret = process.env.CRON_SECRET || '';
    const bgUrl = `${baseUrl}/.netlify/functions/slack-agent-background`;
    try {
        await fetch(bgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, ...payload }),
        });
    } catch (err) {
        console.error('Failed to trigger slack-agent-background:', err);
    }
}

export async function POST(request: NextRequest) {
    try {
        // Get raw body for signature verification
        const body = await request.text();
        const payload: SlackEventPayload = JSON.parse(body);

        // Handle URL verification challenge FIRST (before signature check)
        // Slack's challenge request may not include proper signing headers
        if (payload.type === 'url_verification') {
            return NextResponse.json({ challenge: payload.challenge });
        }

        // Now verify request is from Slack for all other events
        const { timestamp, signature } = extractSlackHeaders(request);

        if (!timestamp || !signature) {
            return NextResponse.json({ error: 'Missing Slack headers' }, { status: 400 });
        }

        if (!SLACK_SIGNING_SECRET) {
            console.error('SLACK_SIGNING_SECRET not configured');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        if (!verifySlackRequest(body, timestamp, signature, SLACK_SIGNING_SECRET)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        // Handle events
        if (payload.type === 'event_callback') {
            const { event } = payload;

            switch (event.type) {
                case 'app_home_opened':
                    await handleAppHomeOpened(event);
                    break;

                case 'app_mention':
                    await handleAppMention(event);
                    break;

                case 'message':
                    if (event.channel_type === 'im') {
                        await handleDirectMessage(event);
                    }
                    break;

                case 'link_shared':
                    await handleLinkShared(event);
                    break;

                default:
                    console.log('Unhandled event type:', event.type);
            }
        }

        // Acknowledge receipt
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Slack events error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

async function handleAppHomeOpened(event: any) {
    try {
        const userId = event.user;
        if (!userId) {
            console.error('No user ID in app_home_opened event');
            return;
        }

        // Look up user by Slack user_id
        const supabase = (await import('@/lib/supabase/server')).createClient();

        const { data: appUser, error: userError } = await supabase
            .from('app_user')
            .select('id, email, first_name, last_name')
            .eq('slack_handle', userId)
            .single();

        // Build home view blocks
        const blocks: any[] = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: '🚀 ClearGO Launch Console',
                    emoji: true,
                },
            },
        ];

        if (userError || !appUser) {
            // User not linked - show welcome message
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `👋 Hi! I couldn't find your account linked to this Slack user.\n\nPlease make sure your Slack handle is synced in the Launch Console.`,
                },
            });
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: 'Once your account is linked, you\'ll see your launches and criteria here.',
                },
            });
        } else {
            // Query launches where user is owner
            const { data: ownedLaunches } = await supabase
                .from('epic')
                .select('id, name, tier, readiness_status, readiness_score, risk_level, target_launch_date')
                .eq('owner_id', appUser.id)
                .order('target_launch_date', { ascending: true })
                .limit(5);

            // Query criteria where user is decision owner
            const { data: criteriaStatuses } = await supabase
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

            const launches = ownedLaunches || [];
            const criteria = criteriaStatuses || [];

            // Add welcome message
            const firstName = appUser.first_name || 'there';
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `Welcome back, *${firstName}*! 👋\n\nHere's what needs your attention:`,
                },
            });

            blocks.push({ type: 'divider' });

            // Add owned launches section
            if (launches.length > 0) {
                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Launches you own (${launches.length}):*`,
                    },
                });

                for (const launch of launches) {
                    const statusEmoji = launch.readiness_status === 'GO' ? '✅' :
                        launch.readiness_status === 'CONDITIONAL_GO' ? '⚠️' : '❌';
                    const riskEmoji = launch.risk_level === 'HIGH' ? '🔴' :
                        launch.risk_level === 'MEDIUM' ? '🟡' : '🟢';
                    const score = launch.readiness_score ? Math.round(launch.readiness_score * 100) : 0;

                    blocks.push({
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `${statusEmoji} *${launch.name}* (${launch.tier})\n${riskEmoji} Risk: ${launch.risk_level} | Score: ${score}%`,
                        },
                        accessory: {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'View Details',
                                emoji: true,
                            },
                            url: `${APP_URL}/epics/${launch.id}`,
                        },
                    });
                }
            } else {
                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '_You don\'t own any launches yet._',
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
                                text: `${staleIndicator}*${criterionData.label}*\nLaunch: ${epic.name} | Status: ${criterion.status}`,
                            },
                            accessory: {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'View Launch',
                                    emoji: true,
                                },
                                url: `${APP_URL}/epics/${epic.id}`,
                            },
                        });
                    }
                }
            } else {
                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '_No criteria awaiting your decision._ ✅',
                    },
                });
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
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View All Launches',
                            emoji: true,
                        },
                        url: `${APP_URL}/epics`,
                    },
                ],
            });
        }

        // Publish home view
        const slackClient = getSlackClient();
        await slackClient.publishHomeView(userId, {
            type: 'home',
            blocks,
        });

        console.log('Published home view for user:', userId);
    } catch (error) {
        console.error('Error handling app home opened:', error);
        // Try to publish a basic error view
        try {
            const slackClient = getSlackClient();
            await slackClient.publishHomeView(event.user, {
                type: 'home',
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: '⚠️ Sorry, there was an error loading your home view. Please try again later.',
                        },
                    },
                ],
            });
        } catch (publishError) {
            console.error('Failed to publish error home view:', publishError);
        }
    }
}

async function resolveUserEmailFromSlackId(slackUserId: string): Promise<string | null> {
    try {
        const { createAdminClient } = await import('@/lib/supabase/server');
        const supabase = createAdminClient();
        const { data } = await supabase
            .from('app_user')
            .select('email')
            .eq('slack_handle', slackUserId)
            .maybeSingle();
        return data?.email ?? null;
    } catch {
        return null;
    }
}

/** Strip the bot @mention from the text so the agent sees a clean query */
function stripBotMention(text: string): string {
    return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

async function handleAppMention(event: any) {
    const slackUserId: string = event.user;
    const rawText: string = event.text || '';
    const channel: string = event.channel;
    const threadTs: string = event.thread_ts || event.ts;

    if (event.bot_id) return;

    const message = stripBotMention(rawText);
    if (!message) return;

    const slackClient = getSlackClient();

    if (!hasCleargoAgentKey()) {
        await slackClient.postMessage({
            channel,
            thread_ts: threadTs,
            text: 'The ClearGO AI assistant is not configured. Contact your admin to enable it.',
        });
        return;
    }

    try {
        await slackClient.addReaction(channel, event.ts, 'hourglass_flowing_sand');
    } catch {
        // Reactions are non-critical
    }

    const userEmail = await resolveUserEmailFromSlackId(slackUserId);
    await triggerAgentBackground({
        type: 'app_mention',
        message,
        channel,
        thread_ts: threadTs,
        userEmail: userEmail ?? undefined,
    });
}

async function handleDirectMessage(event: any) {
    const slackUserId: string = event.user;
    const channel: string = event.channel;
    const text: string = event.text || '';

    if (event.bot_id || event.subtype) return;
    if (!text.trim()) return;

    const slackClient = getSlackClient();

    if (!hasCleargoAgentKey()) {
        await slackClient.postMessage({
            channel,
            text: 'The ClearGO AI assistant is not configured. Contact your admin to enable it.',
        });
        return;
    }

    const userEmail = await resolveUserEmailFromSlackId(slackUserId);
    await triggerAgentBackground({
        type: 'direct_message',
        message: text.trim(),
        channel,
        userEmail: userEmail ?? undefined,
    });
}

async function handleLinkShared(event: any) {
    // TODO: Unfurl launch console URLs
    console.log('Link shared:', event.links);
}
