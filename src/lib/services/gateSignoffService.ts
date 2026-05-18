/**
 * Gate Sign-off Ready Notification Service
 *
 * When all non-gate criteria in a category for a given epic are rated (status
 * is not NOT_SET), notifies the decision owner of the gate criterion in that
 * same category so they know it's time to provide their sign-off.
 *
 * Duplicate notifications are suppressed: if a gate_signoff_ready notification
 * has already been sent for the same gate criterion status within the past 24
 * hours, no additional notification is sent.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import {
    sendSlackNotification,
    canReceiveSlackNotification,
    syncUserSlackHandle,
} from '@/lib/slack/notifications';
import { sendEmailNotification } from '@/lib/email/notifications';

type NotificationChannel = 'email' | 'slack' | 'both' | 'none';

const CATEGORY_LABELS: Record<string, string> = {
    PRODUCT_TECH: 'Product & Tech',
    PRODUCT_DOCUMENTATION: 'Product Documentation',
    GTM: 'Go-to-Market',
    SUPPORT: 'Customer Support',
    DATA_ANALYTICS: 'Data & Analytics',
    ANALYTICS_AND_METRICS: 'Analytics & Metrics',
    LEGAL_SECURITY: 'Legal & Security',
    OPS: 'Operations',
    STRATEGY: 'Strategy',
    OTHER: 'Other',
};

/**
 * After a non-gate criterion status is updated, check whether all non-gate
 * criteria in the same category are now rated. If so, and the gate criterion
 * in that category is still NOT_SET, notify the gate owner.
 */
export async function maybeNotifyGateOwnerForCategory(
    epicId: string,
    updatedLcsId: string,
    supabase: SupabaseClient
): Promise<void> {
    try {
        // 1. Fetch the updated row to get its category and confirm it's not a gate
        const { data: updatedRow, error: rowError } = await supabase
            .from('epic_criterion_status')
            .select('id, criterion:criterion_id(category, gate)')
            .eq('id', updatedLcsId)
            .eq('epic_id', epicId)
            .single();

        if (rowError || !updatedRow) {
            console.error('[gateSignoffService] Failed to fetch updated lcs row:', rowError);
            return;
        }

        const criterion = (updatedRow as any).criterion;
        if (!criterion || criterion.gate === true) {
            // We only react to non-gate updates
            return;
        }

        const category: string = criterion.category;

        // 2. Fetch all criteria statuses in the same category for this epic
        const { data: categoryRows, error: catError } = await supabase
            .from('epic_criterion_status')
            .select(`
                id,
                status,
                criterion:criterion_id ( label, gate, is_active ),
                decision_owner:decision_owner_id ( id, email, first_name, last_name, slack_handle, notification_preferences )
            `)
            .eq('epic_id', epicId)
            .eq('criterion.category', category);

        if (catError || !categoryRows) {
            console.error('[gateSignoffService] Failed to fetch category rows:', catError);
            return;
        }

        // Filter to only active criteria
        const activeRows = categoryRows.filter((r: any) => r.criterion?.is_active !== false);

        const gateCriteria = activeRows.filter((r: any) => r.criterion?.gate === true);
        const nonGateCriteria = activeRows.filter((r: any) => r.criterion?.gate === false);

        // 3. Early exit if no gate criterion exists in this category
        if (gateCriteria.length === 0) return;

        // 4. Check all non-gate criteria are rated
        const allNonGateRated = nonGateCriteria.length > 0 &&
            nonGateCriteria.every((r: any) => r.status !== 'NOT_SET');
        if (!allNonGateRated) return;

        // 5. Find unrated gate criteria to notify about
        const unratedGates = gateCriteria.filter((r: any) => r.status === 'NOT_SET');
        if (unratedGates.length === 0) return;

        // 6. Fetch epic name for the notification message
        const { data: epic } = await supabase
            .from('epic')
            .select('name')
            .eq('id', epicId)
            .single();
        const epicName = (epic as any)?.name ?? 'Unknown Epic';

        const categoryLabel = CATEGORY_LABELS[category] ?? category;
        const adminClient = createAdminClient();

        for (const gate of unratedGates) {
            const owner = (gate as any).decision_owner;
            if (!owner?.email) continue;

            // 7. Dedup: skip if already sent in the last 24 hours for this gate criterion status
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: recentLog } = await adminClient
                .from('notification_log')
                .select('id')
                .eq('type', 'gate_signoff_ready')
                .eq('epic_id', epicId)
                .filter('payload->gate_criterion_status_id', 'eq', gate.id)
                .gte('sent_at', cutoff)
                .limit(1)
                .maybeSingle();

            if (recentLog) {
                console.log(`[gateSignoffService] Skipping duplicate gate_signoff_ready for gate lcs ${gate.id}`);
                continue;
            }

            // 8. Resolve channel preference (user setting → system default of 'slack')
            const channelPref: NotificationChannel =
                (owner as any).notification_preferences?.gate_signoff_ready ?? 'slack';

            if (channelPref === 'none') {
                console.log(`[gateSignoffService] User ${owner.email} opted out of gate_signoff_ready notifications; skipping`);
                continue;
            }

            const ownerName = [owner.first_name, owner.last_name].filter(Boolean).join(' ') || owner.email;
            const gateCriterionLabel = (gate as any).criterion?.label ?? 'Sign-off';
            const notifMetadata = {
                epic_name: epicName,
                epic_id: epicId,
                category_label: categoryLabel,
                gate_criterion_label: gateCriterionLabel,
                gate_criterion_status_id: gate.id,
                completed_count: nonGateCriteria.length,
                recipient_name: ownerName,
            };

            // 9. Send via Slack (if preference includes slack)
            if (channelPref === 'slack' || channelPref === 'both') {
                if (!owner.slack_handle) {
                    const synced = await syncUserSlackHandle(owner.email);
                    if (synced) owner.slack_handle = synced;
                }
                if (await canReceiveSlackNotification(owner.email)) {
                    await sendSlackNotification({
                        type: 'gate_signoff_ready',
                        priority: 'high',
                        recipient: {
                            id: owner.id,
                            email: owner.email,
                            slack_handle: owner.slack_handle ?? undefined,
                            name: ownerName,
                        },
                        launch_id: epicId,
                        metadata: notifMetadata,
                    });
                } else {
                    console.log(`[gateSignoffService] Slack disabled for ${owner.email}; skipping Slack leg`);
                }
            }

            // 10. Send via Email (if preference includes email)
            if (channelPref === 'email' || channelPref === 'both') {
                await sendEmailNotification({
                    type: 'gate_signoff_ready',
                    recipientEmail: owner.email,
                    userId: owner.id,
                    epicId,
                    metadata: notifMetadata,
                });
            }

            console.log(`[gateSignoffService] Sent gate_signoff_ready (channel: ${channelPref}) to ${owner.email} for epic ${epicId}, gate lcs ${gate.id}`);
        }
    } catch (err: any) {
        // Non-fatal: log but don't fail the parent request
        console.error('[gateSignoffService] Unexpected error in maybeNotifyGateOwnerForCategory:', err?.message ?? err);
    }
}

/**
 * Given a list of (epicId, category) pairs derived from gate criteria that are
 * candidates for nudge notifications, returns a Set of `${epicId}::${category}`
 * keys where NOT all non-gate criteria in that category are yet rated (i.e.
 * at least one non-gate has status = NOT_SET).
 *
 * Gate criteria matching any key in the returned set should be suppressed from
 * nudge notifications — their owners have nothing to act on yet.
 */
export async function getEpicCategoryPairsWithUnratedSubcriteria(
    pairs: Array<{ epicId: string; category: string }>,
    supabase: SupabaseClient
): Promise<Set<string>> {
    const blocked = new Set<string>();

    // Deduplicate pairs
    const seen = new Set<string>();
    const uniquePairs: Array<{ epicId: string; category: string }> = [];
    for (const p of pairs) {
        const key = `${p.epicId}::${p.category}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniquePairs.push(p);
        }
    }

    for (const { epicId, category } of uniquePairs) {
        try {
            const { data: rows } = await supabase
                .from('epic_criterion_status')
                .select('status, criterion:criterion_id(gate, is_active)')
                .eq('epic_id', epicId)
                .eq('criterion.category', category);

            if (!rows) continue;

            const activeNonGate = rows.filter(
                (r: any) => r.criterion?.is_active !== false && r.criterion?.gate === false
            );

            const hasUnrated = activeNonGate.some((r: any) => r.status === 'NOT_SET');
            if (hasUnrated) {
                blocked.add(`${epicId}::${category}`);
            }
        } catch (err: any) {
            console.error(`[gateSignoffService] Error checking subcriteria for ${epicId}::${category}:`, err?.message ?? err);
        }
    }

    return blocked;
}
