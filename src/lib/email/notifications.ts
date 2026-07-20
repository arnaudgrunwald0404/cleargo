import { resend, EMAIL_SENDER } from './client';
import { getLaunchStatusChangeEmail, getRiskAlertEmail, getCriteriaNudgeEmail, getGateSignoffReadyEmail, getMasterApprovalReadyEmail } from './templates';
import { logNotification } from '../slack/notifications';
import { createAdminClient } from '@/lib/supabase/server';

export type EmailNotificationType = 'launch_status_change' | 'launch_risk_alert' | 'criteria_nudge' | 'gate_signoff_ready' | 'master_approval_ready';

export interface EmailNotificationPayload {
    type: EmailNotificationType;
    recipientEmail: string;
    metadata: Record<string, any>;
    userId?: string;
    epicId?: string;
}

/**
 * Check if an email notification type is enabled
 */
async function isEmailNotificationTypeEnabled(type: EmailNotificationType): Promise<boolean> {
    const { getSettings } = await import('@/lib/settings-db');
    const settings = await getSettings();
    
    // Check system flag first
    if (settings.email_notifications_enabled === false) {
        return false;
    }
    
    // Check type-specific flag
    const flagKey = `email_${type}` as keyof typeof settings;
    const flagValue = settings[flagKey];
    
    // Default to true if flag is undefined (backward compatibility)
    return flagValue !== false;
}

export async function sendEmailNotification(payload: EmailNotificationPayload) {
    // Check if this notification type is enabled
    if (!(await isEmailNotificationTypeEnabled(payload.type))) {
        let userId = payload.userId;
        const epicId = payload.epicId;

        // Look up user_id from email if not provided
        if (!userId) {
            try {
                const supabase = createAdminClient();
                const { data: user } = await supabase
                    .from('app_user')
                    .select('id')
                    .ilike('email', payload.recipientEmail.trim())
                    .maybeSingle();
                if (user) {
                    userId = user.id;
                }
            } catch (err) {
                // Ignore lookup errors
            }
        }

        await logNotification({
            user_id: userId,
            launch_id: epicId,
            type: payload.type,
            payload: payload.metadata,
            delivery_channel: 'email',
            status: 'pending',
            error: `Skipped: notification type '${payload.type}' is disabled in Settings`,
        });
        return;
    }

    let userId = payload.userId;
    let epicId = payload.epicId;

    // Extract epic ID from metadata if not provided
    if (!epicId && payload.metadata.epicUrl) {
        const epicUrlMatch = payload.metadata.epicUrl.match(/\/epics\/([a-f0-9-]+)/);
        if (epicUrlMatch) {
            epicId = epicUrlMatch[1];
        }
    }

    // Look up user_id from email if not provided
    if (!userId) {
        try {
            const supabase = createAdminClient();
            const { data: user } = await supabase
                .from('app_user')
                .select('id')
                .ilike('email', payload.recipientEmail.trim())
                .maybeSingle();
            if (user) {
                userId = user.id;
            }
        } catch (err) {
            console.warn('Could not look up user_id for email notification:', err);
        }
    }

    try {
        let emailContent;

        switch (payload.type) {
            case 'launch_status_change':
                emailContent = getLaunchStatusChangeEmail(
                    payload.metadata.launchName,
                    payload.metadata.oldStatus,
                    payload.metadata.newStatus,
                    payload.metadata.launchUrl
                );
                break;
            case 'launch_risk_alert':
                emailContent = getRiskAlertEmail(
                    payload.metadata.launchName,
                    payload.metadata.riskLevel,
                    payload.metadata.reason,
                    payload.metadata.launchUrl
                );
                break;
            case 'criteria_nudge':
                emailContent = getCriteriaNudgeEmail(
                    payload.metadata.recipientName || null,
                    payload.metadata.release_groups || [],
                    payload.metadata.total_criteria_count || 0,
                    payload.metadata.appUrl || process.env.NEXT_PUBLIC_APP_URL || '',
                    payload.metadata.org_time_zone
                );
                break;
            case 'gate_signoff_ready':
                emailContent = getGateSignoffReadyEmail({
                    recipientName: payload.metadata.recipient_name || '',
                    epicName: payload.metadata.epic_name || '',
                    epicId: payload.metadata.epic_id || '',
                    categoryLabel: payload.metadata.category_label || '',
                    gateCriterionLabel: payload.metadata.gate_criterion_label || '',
                    completedCount: payload.metadata.completed_count || 0,
                });
                break;
            case 'master_approval_ready':
                emailContent = getMasterApprovalReadyEmail({
                    recipientName: payload.metadata.recipient_name || '',
                    epicName: payload.metadata.epic_name || '',
                    epicId: payload.metadata.epic_id || '',
                    gateCount: payload.metadata.gate_count || 0,
                });
                break;
            default:
                throw new Error(`Unknown email type: ${payload.type}`);
        }

        const data = await resend.emails.send({
            from: EMAIL_SENDER,
            to: payload.recipientEmail,
            subject: emailContent.subject,
            html: emailContent.html,
        });

        console.log('Email sent:', data);

        // Log successful notification to database
        await logNotification({
            user_id: userId,
            launch_id: epicId,
            type: payload.type,
            payload: payload.metadata,
            delivery_channel: 'email',
            status: 'sent',
        });
    } catch (error: any) {
        console.error('Failed to send email:', error);

        // Log failed notification to database
        await logNotification({
            user_id: userId,
            launch_id: epicId,
            type: payload.type,
            payload: payload.metadata,
            delivery_channel: 'email',
            status: 'failed',
            error: error.message || String(error),
        });
    }
}
