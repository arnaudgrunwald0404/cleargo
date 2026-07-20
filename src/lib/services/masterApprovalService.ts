/**
 * Master Approval Ready Notification Service (CLEARGO-I-9)
 *
 * Departments sign off via their category gate criteria (see gateSignoffService).
 * The final "master approver(s)" for a release should only be pinged once EVERY
 * department gate on the epic has been signed off — not before. This service
 * fires that final notification.
 *
 * Master approvers are configured globally via app_settings.master_approver_emails.
 * Each approver's channel (slack/email/both/none) comes from their
 * notification_preferences.master_approval_ready (default: slack). Duplicate
 * notifications for the same epic are suppressed within 24 hours.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import {
    sendSlackNotification,
    canReceiveSlackNotification,
    syncUserSlackHandle,
} from '@/lib/slack/notifications';
import { sendEmailNotification } from '@/lib/email/notifications';
import { getSettings } from '@/lib/settings-db';

type NotificationChannel = 'email' | 'slack' | 'both' | 'none';

/**
 * After any gate criterion status change, check whether every active gate
 * criterion on the epic is now decided (status != NOT_SET). If so, notify the
 * configured master approver(s) that the release is ready for final sign-off.
 */
export async function maybeNotifyMasterApproversWhenGatesComplete(
    epicId: string,
    updatedLcsId: string,
    supabase: SupabaseClient
): Promise<void> {
    try {
        // Only react to gate criterion changes.
        const { data: updatedRow } = await supabase
            .from('epic_criterion_status')
            .select('id, criterion:criterion_id(gate)')
            .eq('id', updatedLcsId)
            .eq('epic_id', epicId)
            .single();
        if (!updatedRow || (updatedRow as any).criterion?.gate !== true) return;

        // Master approvers must be configured.
        const settings = await getSettings();
        const approverEmails = (settings.master_approver_emails || [])
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);
        if (approverEmails.length === 0) return;

        // Every active gate criterion on the epic must be decided.
        const { data: gateRows, error: gateErr } = await supabase
            .from('epic_criterion_status')
            .select('id, status, criterion:criterion_id(gate, is_active)')
            .eq('epic_id', epicId);
        if (gateErr || !gateRows) return;

        const activeGates = gateRows.filter(
            (r: any) => r.criterion?.gate === true && r.criterion?.is_active !== false
        );
        if (activeGates.length === 0) return;
        const allGatesDecided = activeGates.every((r: any) => r.status !== 'NOT_SET');
        if (!allGatesDecided) return;

        const { data: epic } = await supabase
            .from('epic')
            .select('name')
            .eq('id', epicId)
            .single();
        const epicName = (epic as any)?.name ?? 'Unknown Epic';

        const adminClient = createAdminClient();

        // Resolve approver users.
        const { data: approvers } = await supabase
            .from('app_user')
            .select('id, email, first_name, last_name, slack_handle, notification_preferences')
            .in('email', approverEmails);

        for (const approver of approvers || []) {
            if (!approver.email) continue;

            // Dedup: one master_approval_ready per epic per approver per 24h.
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: recentLog } = await adminClient
                .from('notification_log')
                .select('id')
                .eq('type', 'master_approval_ready')
                .eq('epic_id', epicId)
                .eq('user_id', approver.id)
                .gte('sent_at', cutoff)
                .limit(1)
                .maybeSingle();
            if (recentLog) continue;

            const channelPref: NotificationChannel =
                (approver as any).notification_preferences?.master_approval_ready ?? 'slack';
            if (channelPref === 'none') continue;

            const approverName =
                [approver.first_name, approver.last_name].filter(Boolean).join(' ') || approver.email;
            const metadata = {
                epic_name: epicName,
                epic_id: epicId,
                gate_count: activeGates.length,
                recipient_name: approverName,
            };

            if (channelPref === 'slack' || channelPref === 'both') {
                if (!approver.slack_handle) {
                    const synced = await syncUserSlackHandle(approver.email);
                    if (synced) approver.slack_handle = synced;
                }
                if (await canReceiveSlackNotification(approver.email)) {
                    await sendSlackNotification({
                        type: 'master_approval_ready',
                        priority: 'high',
                        recipient: {
                            id: approver.id,
                            email: approver.email,
                            slack_handle: approver.slack_handle ?? undefined,
                            name: approverName,
                        },
                        launch_id: epicId,
                        metadata,
                    });
                }
            }

            if (channelPref === 'email' || channelPref === 'both') {
                await sendEmailNotification({
                    type: 'master_approval_ready',
                    recipientEmail: approver.email,
                    userId: approver.id,
                    epicId,
                    metadata,
                });
            }

            console.log(`[masterApprovalService] Sent master_approval_ready (${channelPref}) to ${approver.email} for epic ${epicId}`);
        }
    } catch (err: any) {
        console.error('[masterApprovalService] Unexpected error:', err?.message ?? err);
    }
}
