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
    buildCriterionCommentOrAttachmentMessage,
} from './templates';
import { getSlackTheme } from './theme';

/**
 * Check if a string is a valid Slack user ID
 * Slack user IDs start with 'U' (e.g., U12345678)
 */
function isSlackUserId(handle: string): boolean {
    return handle.startsWith('U') && handle.length > 1;
}

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
    let isDirectMessage = false;

    try {
        let message;
        let channel = payload.channel;

        // Determine channel if not specified
        if (!channel && payload.recipient?.slack_handle) {
            // Send as DM to user
            const slackHandle = payload.recipient.slack_handle;
            
            // Validate that slack_handle is a valid Slack user ID
            if (!isSlackUserId(slackHandle)) {
                throw new Error(
                    `Invalid Slack user ID format: "${slackHandle}". Expected user ID starting with 'U'.`
                );
            }

            try {
                // Open DM conversation to get channel ID
                channel = await client.openConversation(slackHandle);
                isDirectMessage = true;
                console.log(`Opened DM conversation with user ${slackHandle}, channel: ${channel}`);
            } catch (dmError: any) {
                console.error(`Failed to open DM conversation with user ${slackHandle}:`, dmError);
                // Log the failure but don't throw - allow fallback to default channel
                await logNotification({
                    user_id: payload.recipient?.id,
                    launch_id: payload.launch_id,
                    type: payload.type,
                    payload: payload.metadata,
                    delivery_channel: 'slack',
                    status: 'failed',
                    error: `Failed to open DM: ${dmError.message}`,
                });
                // Fall back to default channel
                channel = process.env.SLACK_DEFAULT_CHANNEL || '#launch-readiness-test';
                console.warn(`Falling back to default channel: ${channel}`);
            }
        } else if (!channel) {
            // Use default channel from settings
            channel = process.env.SLACK_DEFAULT_CHANNEL || '#launch-readiness-test';
        }

        // Load theme configuration
        const theme = await getSlackTheme();

        // Build message based on notification type
        switch (payload.type) {
            case 'stale_criterion':
                if (!payload.metadata) throw new Error('Missing metadata for stale_criterion');
                message = buildStaleCriterionMessage(payload.metadata as any, theme);
                break;

            case 'launch_risk_alert':
                if (!payload.metadata) throw new Error('Missing metadata for launch_risk_alert');
                message = buildLaunchRiskAlertMessage(payload.metadata as any, theme);
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

            case 'criteria_assignment':
                if (!payload.metadata) throw new Error('Missing metadata for criteria_assignment');
                const { buildCriteriaAssignmentMessage } = await import('./templates');
                // Reconstruct grouped criteria from metadata
                const groupedCriteria = {
                    epic_id: payload.launch_id!,
                    epic_name: payload.metadata.epic_name,
                    assignee_id: payload.recipient!.id,
                    assignee_email: payload.recipient!.email,
                    assignee_name: payload.recipient!.name,
                    assignee_slack_handle: payload.recipient!.slack_handle,
                    criteria: payload.metadata.criteria || [],
                };
                message = buildCriteriaAssignmentMessage(groupedCriteria as any);
                break;

            case 'retro_reminder':
                if (!payload.metadata) throw new Error('Missing metadata for retro_reminder');
                const { buildRetroReminderMessage } = await import('./templates/retro-reminders');
                message = buildRetroReminderMessage(
                    payload.metadata.epic,
                    payload.metadata.dayMarker,
                    payload.metadata.daysSinceLaunch
                );
                break;

            case 'scorecard_alert':
                if (!payload.metadata) throw new Error('Missing metadata for scorecard_alert');
                const { buildScorecardAlertMessage } = await import('./templates/scorecard-alerts');
                message = buildScorecardAlertMessage(
                    payload.metadata.epic,
                    payload.metadata.scorecard,
                    payload.metadata.alertType
                );
                break;

            case 'criteria_nudge':
                if (!payload.metadata) throw new Error('Missing metadata for criteria_nudge');
                const { buildCriteriaNudgeMessage } = await import('./templates');
                const groupedNudgeCriteria = {
                    epic_id: payload.launch_id!,
                    epic_name: payload.metadata.epic_name,
                    assignee_id: payload.recipient!.id,
                    assignee_email: payload.recipient!.email,
                    assignee_name: payload.recipient!.name,
                    assignee_slack_handle: payload.recipient!.slack_handle,
                    criteria: payload.metadata.criteria || [],
                };
                message = buildCriteriaNudgeMessage(groupedNudgeCriteria as any, payload.metadata.nudge_type);
                break;

            case 'criterion_comment_or_attachment':
                if (!payload.metadata) throw new Error('Missing metadata for criterion_comment_or_attachment');
                message = buildCriterionCommentOrAttachmentMessage(payload.metadata as any);
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
            isDirectMessage,
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
        const errorType = isDirectMessage ? 'DM' : 'channel';
        console.error(`Failed to send Slack ${errorType} notification:`, error);
        console.error('Error details:', {
            type: payload.type,
            recipient: payload.recipient?.email,
            slack_handle: payload.recipient?.slack_handle,
            channel: payload.channel,
            error: error.message,
        });

        // Log failed notification to database
        await logNotification({
            user_id: payload.recipient?.id,
            launch_id: payload.launch_id,
            type: payload.type,
            payload: payload.metadata,
            delivery_channel: 'slack',
            status: 'failed',
            error: `${errorType} error: ${error.message}`,
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
 * Sync Slack handle for a single user by email
 * @param email User's email address
 * @returns Slack user ID if found, null otherwise
 */
export async function syncUserSlackHandle(email: string): Promise<string | null> {
    const client = getSlackClient();
    const supabase = createClient();

    try {
        // Look up Slack user by email
        const slackUserResponse = await client.getUserByEmail(email);

        if (slackUserResponse && slackUserResponse.user?.id) {
            // Update slack_handle in database
            const { error: updateError } = await supabase
                .from('app_user')
                .update({ slack_handle: slackUserResponse.user.id })
                .eq('email', email);

            if (updateError) {
                console.error(`Error updating Slack handle for ${email}:`, updateError);
                return null;
            }

            console.log(`Synced Slack handle for ${email}: ${slackUserResponse.user.id}`);
            return slackUserResponse.user.id;
        }

        return null;
    } catch (err: any) {
        console.error(`Error looking up Slack user for ${email}:`, err);
        return null;
    }
}

/**
 * Sync Slack handles for all users
 * Matches users by email and updates their slack_handle
 * @returns Object with sync statistics
 */
export async function syncSlackHandles(): Promise<{
    synced: number;
    errors: number;
    total: number;
    details: Array<{ email: string; slack_handle?: string; error?: string }>;
}> {
    const client = getSlackClient();
    const supabase = createClient();

    const result = {
        synced: 0,
        errors: 0,
        total: 0,
        details: [] as Array<{ email: string; slack_handle?: string; error?: string }>,
    };

    try {
        // Get all users from database
        const { data: users, error: usersError } = await supabase
            .from('app_user')
            .select('id, email, slack_handle')
            .not('email', 'is', null);

        if (usersError) {
            console.error('Error fetching users:', usersError);
            throw new Error(`Failed to fetch users: ${usersError.message}`);
        }

        if (!users || users.length === 0) {
            console.log('No users found to sync');
            return result;
        }

        result.total = users.length;

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
                        result.errors++;
                        result.details.push({
                            email: user.email,
                            error: updateError.message,
                        });
                    } else {
                        console.log(`Synced Slack handle for ${user.email}: ${slackUserResponse.user.id}`);
                        result.synced++;
                        result.details.push({
                            email: user.email,
                            slack_handle: slackUserResponse.user.id,
                        });
                    }
                } else {
                    // User not found in Slack
                    result.details.push({
                        email: user.email,
                        error: 'User not found in Slack workspace',
                    });
                }
            } catch (err: any) {
                console.error(`Error looking up Slack user for ${user.email}:`, err);
                result.errors++;
                result.details.push({
                    email: user.email,
                    error: err.message || 'Failed to lookup Slack user',
                });
            }
        }

        console.log(`Slack handle sync completed: ${result.synced} synced, ${result.errors} errors`);
        return result;
    } catch (error: any) {
        console.error('Slack handle sync failed:', error);
        throw error;
    }
}
