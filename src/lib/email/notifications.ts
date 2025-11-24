import { resend, EMAIL_SENDER } from './client';
import { getLaunchStatusChangeEmail, getRiskAlertEmail } from './templates';

export type EmailNotificationType = 'launch_status_change' | 'launch_risk_alert';

export interface EmailNotificationPayload {
    type: EmailNotificationType;
    recipientEmail: string;
    metadata: Record<string, any>;
}

export async function sendEmailNotification(payload: EmailNotificationPayload) {
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
    } catch (error) {
        console.error('Failed to send email:', error);
        // Don't throw, just log
    }
}
