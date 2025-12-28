/**
 * Slack notification service
 * Sends notifications to Slack channels and users
 */

import { getSlackClient } from './client';
import { createClient } from '@/lib/supabase/server';
import type { SlackNotificationPayload, SlackUser } from '@/types/slack';
import {
    buildStaleCriterionMessage,
    buildLaunchRiskAlertMessage,
    buildGoNoGoDecisionMessage,
    buildLeadershipDigestMessage,
    buildLaunchStatusChangeMessage,
    buildDelegationMessage,
} from './templates';

/**
 * Log notification to database
 */
async function logNotification(data: {
    user_id?: string;
    launch_id?: string;
    type: string;
    payload: any;
    delivery_channel: string;
    status: 'sent' | 'failed' | 'pending';
    error?: string;
    slack_ts?: string;
    slack_channel?: string;
}) {
    try {
        const supabase = createClient();
        const { error } = await supabase.from('notification_log').insert({
            user_id: data.user_id || null,
            launch_id: data.launch_id || null,
            type: data.type,
            payload: data.payload,
            delivery_channel: data.delivery_channel,
            status: data.status,
            error: data.error || null,
            slack_ts: data.slack_ts || null,
            slack_channel: data.slack_channel || null,
            sent_at: new Date().toISOString(),
        });

        if (error) {
            console.error('Failed to log notification:', error);
        }
    } catch (err) {
        console.error('Error logging notification:', err);
    }
}

/**
 * Send a notification to Slack
 */
export async function sendSlackNotification(payload: SlackNotificationPayload): Promise<void> {
    const client = getSlackClient();

    try {
        let message;
        let channel = payload.channel;

        // Determine channel if not specified
        if (!channel && payload.recipient?.slack_handle) {
            // Send as DM to user
            channel = payload.recipient.slack_handle;
        } else if (!channel) {
            // Use default channel from settings
            channel = process.env.SLACK_DEFAULT_CHANNEL || '#launch-readiness-test';
        }

        // Build message based on notification type
        switch (payload.type) {
            case 'stale_criterion':
                if (!payload.metadata) throw new Error('Missing metadata for stale_criterion');
                message = buildStaleCriterionMessage(payload.metadata as any);
                break;

            case 'launch_risk_alert':
                if (!payload.metadata) throw new Error('Missing metadata for launch_risk_alert');
                message = buildLaunchRiskAlertMessage(payload.metadata as any);
                break;

            case 'go_no_go_decision':
                if (!payload.metadata) throw new Error('Missing metadata for go_no_go_decision');
                message = buildGoNoGoDecisionMessage(payload.metadata as any);
                break;

            case 'leadership_digest':
                if (!payload.metadata) throw new Error('Missing metadata for leadership_digest');
                message = buildLeadershipDigestMessage(payload.metadata as any);
                break;

            case 'launch_status_change':
                if (!payload.metadata) throw new Error('Missing metadata for launch_status_change');
                message = buildLaunchStatusChangeMessage(payload.metadata as any);
                break;

            case 'delegation':
                if (!payload.metadata) throw new Error('Missing metadata for delegation');
                message = buildDelegationMessage(payload.metadata as any);
                break;

            default:
                throw new Error(`Unknown notification type: ${payload.type}`);
        }

        // Send the message
        const response = await client.postMessage({
            channel,
            ...message,
        });

        console.log('Slack notification sent:', {
            type: payload.type,
            channel,
            ts: response.ts,
        });

        // Log successful notification to database
        await logNotification({
            user_id: payload.recipient?.id,
            launch_id: payload.launch_id,
            type: payload.type,
            payload: payload.metadata,
            delivery_channel: 'slack',
            status: 'sent',
            slack_ts: response.ts,
            slack_channel: channel,
        });
    } catch (error: any) {
        console.error('Failed to send Slack notification:', error);

        // Log failed notification to database
        await logNotification({
            user_id: payload.recipient?.id,
            launch_id: payload.launch_id,
            type: payload.type,
            payload: payload.metadata,
            delivery_channel: 'slack',
            status: 'failed',
            error: error.message,
        });

        throw error;
    }
}

/**
 * Send a batch of notifications (e.g., for digest)
 */
export async function sendBatchNotifications(
    payloads: SlackNotificationPayload[]
): Promise<void> {
    const results = await Promise.allSettled(
        payloads.map((payload) => sendSlackNotification(payload))
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
        console.error(`${failed.length} notifications failed to send`);
    }
}

/**
 * Sync Slack handles for all users
 * Matches users by email and updates their slack_handle
 */
export async function syncSlackHandles(): Promise<void> {
    const client = getSlackClient();
    const supabase = createClient();

    try {
        // Get all users from database
        const { data: users, error: usersError } = await supabase
            .from('app_user')
            .select('id, email, slack_handle')
            .not('email', 'is', null);

        if (usersError) {
            console.error('Error fetching users:', usersError);
            return;
        }

        if (!users || users.length === 0) {
            console.log('No users found to sync');
            return;
        }

        let syncedCount = 0;
        let errorCount = 0;

        // For each user with email, look up Slack user by email
        for (const user of users) {
            try {
                const slackUserResponse = await client.getUserByEmail(user.email);

                if (slackUserResponse && slackUserResponse.user?.id) {
                    // Update slack_handle in database
                    const { error: updateError } = await supabase
                        .from('app_user')
                        .update({ slack_handle: slackUserResponse.user.id })
                        .eq('id', user.id);

                    if (updateError) {
                        console.error(`Error updating user ${user.email}:`, updateError);
                        errorCount++;
                    } else {
                        console.log(`Synced Slack handle for ${user.email}: ${slackUserResponse.user.id}`);
                        syncedCount++;
                    }
                }
            } catch (err) {
                console.error(`Error looking up Slack user for ${user.email}:`, err);
                errorCount++;
            }
        }

        console.log(`Slack handle sync completed: ${syncedCount} synced, ${errorCount} errors`);
    } catch (error) {
        console.error('Slack handle sync failed:', error);
        throw error;
    }
}
