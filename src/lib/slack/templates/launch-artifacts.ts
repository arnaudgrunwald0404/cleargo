/**
 * Slack message for one launch artifact transition.
 *
 * Delivered through sendSlackNotification like every other type, so it lands in
 * the ClearGO Launch Console DM for the one person it applies to, and inherits
 * the handle sync, the per-user opt-out and the skip logging.
 */

import type { LaunchNotifyKind } from '@/lib/services/launchNotificationService';

export interface LaunchArtifactMeta {
    kind: LaunchNotifyKind;
    launch_id: string;
    launch_name: string;
    label: string;
    start_date: string | null;
    due_date: string | null;
    /** Artifacts held up by this one. Only populated for a blocking gate. */
    blocking: string[];
    /** Set when this is the escalation copy rather than the owner's own. */
    owner_email?: string | null;
}

const HEADING: Record<LaunchNotifyKind, (m: LaunchArtifactMeta) => string> = {
    window_open: (m) => `${m.label} can start now`,
    unblocked: (m) => `${m.label} is unblocked`,
    overdue: (m) => `${m.label} is overdue`,
    gate_blocking: (m) => `${m.label} is blocking ${m.launch_name}`,
};

const ICON: Record<LaunchNotifyKind, string> = {
    window_open: '🟢',
    unblocked: '🔓',
    overdue: '🔴',
    gate_blocking: '⛔',
};

function body(m: LaunchArtifactMeta): string {
    const due = m.due_date ? ` Due *${m.due_date}*.` : '';
    switch (m.kind) {
        case 'window_open':
            return `This is your window to start.${due} Everything downstream of it waits on this.`;
        case 'unblocked':
            return `Its predecessor is delivered, so this can begin.${due}`;
        case 'overdue':
            return m.blocking.length
                ? `Past due.${due} Holding up: ${m.blocking.join(', ')}.`
                : `Past due.${due}`;
        case 'gate_blocking':
            return `This gate is past due.${due} It blocks ${m.blocking.join(', ')} — nothing downstream can proceed until it clears.`;
    }
}

export function buildLaunchArtifactMessage(m: LaunchArtifactMeta): {
    text: string;
    blocks: unknown[];
} {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.clearcompany.com';
    const launchUrl = `${baseUrl}/gtm-launches/${m.launch_id}`;
    const heading = `${ICON[m.kind]} ${HEADING[m.kind](m)}`;

    const context: string[] = [`*Launch:* <${launchUrl}|${m.launch_name}>`];
    if (m.start_date) context.push(`*Starts:* ${m.start_date}`);
    // Escalation copy names the owner so the reader knows who to chase rather
    // than assuming the task is theirs.
    if (m.owner_email) context.push(`*Owner:* ${m.owner_email}`);

    return {
        text: heading,
        blocks: [
            {
                type: 'section',
                text: { type: 'mrkdwn', text: `*${heading}*\n${body(m)}` },
            },
            {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: context.join('  ·  ') }],
            },
        ],
    };
}
