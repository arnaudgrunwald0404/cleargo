/**
 * Test endpoint for Slack channel creation
 * Tests creating a channel with format: tmp-cleargo-[releasename]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSlackClient } from '@/lib/slack/client';

export const dynamic = 'force-dynamic';

async function createTestChannel(releaseName: string, inviteEmail?: string) {
    // Validate release name format (alphanumeric, hyphens, underscores only)
    const sanitizedReleaseName = releaseName
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (!sanitizedReleaseName) {
        throw new Error('Invalid release name format');
    }

    const channelName = `tmp-cleargo-${sanitizedReleaseName}`;

    // Slack channel names must be 80 characters or less
    if (channelName.length > 80) {
        throw new Error(`Channel name too long (${channelName.length} chars, max 80)`);
    }

    const client = getSlackClient();
    const result = await client.createChannel(channelName, false);

    const inviteResult: any = {
        invited: false,
        error: null,
    };

    // Invite user if email provided
    if (inviteEmail && result.channel?.id) {
        try {
            // Look up user by email to get their Slack user ID
            const userResponse = await client.getUserByEmail(inviteEmail);
            if (userResponse.user?.id) {
                const inviteResponse = await client.inviteUsersToChannel(
                    result.channel.id,
                    [userResponse.user.id]
                );
                inviteResult.invited = true;
                inviteResult.userId = userResponse.user.id;
                inviteResult.userName = userResponse.user.profile?.display_name || userResponse.user.profile?.real_name;
                // Note: already_in_channel or cant_invite_self are not errors, just info
                if (inviteResponse.error === 'already_in_channel' || inviteResponse.error === 'cant_invite_self') {
                    inviteResult.message = 'User is already in the channel (may be the creator)';
                }
            } else {
                inviteResult.error = 'User not found in Slack workspace';
            }
        } catch (error: any) {
            inviteResult.error = error.message;
            console.error('Error inviting user to channel:', error);
        }
    }

    return {
        success: true,
        message: `Channel created successfully: #${channelName}`,
        channel: {
            id: result.channel?.id,
            name: result.channel?.name,
            created: result.channel?.created,
        },
        invite: inviteResult,
        fullResponse: result,
    };
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { releaseName, inviteEmail } = body;

        if (!releaseName) {
            return NextResponse.json(
                { error: 'Missing releaseName parameter' },
                { status: 400 }
            );
        }

        const result = await createTestChannel(releaseName, inviteEmail);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Channel creation error:', error);
        return NextResponse.json(
            {
                error: 'Failed to create channel',
                details: error.message,
            },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const releaseName = searchParams.get('releaseName');
        const inviteEmail = searchParams.get('inviteEmail') || 'agrunwald@clearcompany.com';

        if (!releaseName) {
            return NextResponse.json(
                {
                    error: 'Missing releaseName query parameter',
                    usage: 'GET /api/integrations/slack/test-channel?releaseName=my-release&inviteEmail=user@example.com',
                },
                { status: 400 }
            );
        }

        const result = await createTestChannel(releaseName, inviteEmail);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Channel creation error:', error);
        return NextResponse.json(
            {
                error: 'Failed to create channel',
                details: error.message,
            },
            { status: 500 }
        );
    }
}

