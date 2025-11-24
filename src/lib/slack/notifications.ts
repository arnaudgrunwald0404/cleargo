/**
 * Slack notification service
 * Sends notifications to Slack channels and users
 */

import { getSlackClient } from './client';
import type { SlackNotificationPayload, SlackUser } from '@/types/slack';
import {
    buildStaleCriterionMessage,
    buildLaunchRiskAlertMessage,
    buildGoNoGoDecisionMessage,
    buildLeadershipDigestMessage,
    buildLaunchStatusChangeMessage,
} from './templates';

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
            channel = process.env.SLACK_DEFAULT_CHANNEL || '#launch-readiness';
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

        // TODO: Log notification to database
        // await logNotification({
        //   user_id: payload.recipient?.id,
        //   type: payload.type,
        //   payload: payload.metadata,
        //   sent_at: new Date(),
        //   delivery_channel: 'slack',
        //   status: 'sent',
        //   slack_ts: response.ts,
        //   slack_channel: channel,
        // });
    } catch (error) {
        console.error('Failed to send Slack notification:', error);

        // TODO: Log failed notification to database
        // await logNotification({
        //   user_id: payload.recipient?.id,
        //   type: payload.type,
        //   payload: payload.metadata,
        //   sent_at: new Date(),
        //   delivery_channel: 'slack',
        //   status: 'failed',
        //   error: error.message,
        // });

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
    // TODO: Implement user sync
    // 1. Get all users from database
    // 2. For each user with email, look up Slack user by email
    // 3. Update slack_handle in database
    console.log('Slack handle sync not yet implemented');
}
