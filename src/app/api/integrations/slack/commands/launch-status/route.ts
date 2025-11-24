/**
 * Slack slash command: /launch-status
 * Get the current status of a specific launch
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest, extractSlackHeaders } from '@/lib/slack/verify';
import type { SlackCommandPayload } from '@/types/slack';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';

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
                text: 'Please provide a launch name or Aha ID. Example: `/launch-status HIRE-123`',
            });
        }

        // TODO: Query database for launch
        // For now, return a placeholder response
        return NextResponse.json({
            response_type: 'in_channel',
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `Searching for launch: *${searchTerm}*...`,
                    },
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: '🚧 This feature is under development. Full launch details will be available soon.',
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
