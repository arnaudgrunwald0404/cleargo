/**
 * Slack slash command: /my-launches
 * View launches you own or are involved with
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest, extractSlackHeaders } from '@/lib/slack/verify';
import type { SlackCommandPayload } from '@/types/slack';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://launch-console.clearcompany.com';

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

        // TODO: Look up user by Slack user_id or user_name
        // TODO: Query launches where user is owner or decision owner

        // Placeholder response
        return NextResponse.json({
            response_type: 'ephemeral',
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '🚀 My Launches',
                        emoji: true,
                    },
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: 'Here are the launches you\'re involved with:',
                    },
                },
                {
                    type: 'divider',
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: '🚧 This feature is under development. Your launches will appear here soon.',
                        },
                    ],
                },
                {
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
                                text: 'View My Items',
                                emoji: true,
                            },
                            url: `${APP_URL}/my-items`,
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
