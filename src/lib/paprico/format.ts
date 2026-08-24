import { formatDateOnlyForDisplay } from '@/lib/date-utils';
import type { AgendaItem, OpenCommitment, PapricoAgenda, PapricoDecision, PapricoMeeting } from './types';

function fmtDate(ymd: string | null | undefined): string {
    if (!ymd) return '—';
    return formatDateOnlyForDisplay(ymd) || ymd;
}

function bandLabel(band: AgendaItem['band']): string {
    return band ? band.toUpperCase() : '—';
}

function agendaRowLine(item: AgendaItem): string {
    const parts: string[] = [item.title];
    if (item.source === 'release') {
        if (item.stage_name) parts.push(`stage: ${item.stage_name} (${fmtDate(item.stage_date)})`);
        if (item.band) parts.push(bandLabel(item.band));
    }
    if (item.owner_email) parts.push(`owner: ${item.owner_email}`);
    if (item.time_box_minutes) parts.push(`${item.time_box_minutes} min`);
    return parts.join(' · ');
}

/**
 * Copyable Slack-formatted agenda block (spec §5.2). Deliberately a manual
 * paste into #paprico in v1 — no Slack automation.
 */
export function buildSlackAgendaBlock(meeting: PapricoMeeting, agenda: PapricoAgenda): string {
    const lines: string[] = [];
    lines.push(`:calendar: *PaPriCo agenda — ${fmtDate(meeting.meeting_date)}*`);
    if (meeting.chair_email) lines.push(`Chair: ${meeting.chair_email}`);
    lines.push('');

    lines.push('*1. Open commitments*');
    if (agenda.open_commitments.length === 0) {
        lines.push('_None — everything landed._');
    } else {
        for (const c of agenda.open_commitments) {
            const overdue = c.age_days != null && c.age_days > 0 ? ` (*${c.age_days}d overdue*)` : '';
            lines.push(`• ${c.item_title ?? c.decision_text} — ${c.owner_email}, due ${fmtDate(c.due_date)}${overdue}`);
        }
    }
    lines.push('');

    lines.push('*2. Overdue and critical*');
    if (agenda.overdue_critical.length === 0) {
        lines.push('_Nothing approaching a stage with pricing, naming or forecast criteria open._');
    } else {
        for (const item of agenda.overdue_critical) lines.push(`• ${agendaRowLine(item)}`);
    }
    lines.push('');

    lines.push('*3. Approaching*');
    if (agenda.approaching.length === 0) {
        lines.push('_Nothing approaching a stage with pricing, naming or forecast criteria open._');
    } else {
        for (const item of agenda.approaching) lines.push(`• ${agendaRowLine(item)}`);
    }
    lines.push('');

    lines.push('*4. Standing items*');
    if (agenda.standing.length === 0) {
        lines.push('_None._');
    } else {
        for (const item of agenda.standing) lines.push(`• ${agendaRowLine(item)}`);
    }

    if (agenda.total_time_box_minutes > 0) {
        lines.push('');
        lines.push(`Time boxed: ${agenda.total_time_box_minutes} min of ${meeting.meeting_length_minutes} min`);
    }
    return lines.join('\n');
}

export type MinutesInput = {
    meeting: PapricoMeeting;
    decisions: Array<PapricoDecision & { item_title?: string | null }>;
    deferredItems: Array<{ title: string; reason: string | null }>;
    blockedItems: Array<{ title: string; blocked_reason: string | null }>;
    openCommitments: OpenCommitment[];
};

/**
 * Minutes for a held meeting (spec §5.5): decisions taken, items deferred and why,
 * items blocked and on what, and commitments still open from prior meetings.
 */
export function buildMinutesMarkdown(input: MinutesInput): string {
    const { meeting, decisions, deferredItems, blockedItems, openCommitments } = input;
    const lines: string[] = [];
    lines.push(`# PaPriCo minutes — ${fmtDate(meeting.meeting_date)}`);
    lines.push('');
    if (meeting.chair_email) lines.push(`**Chair:** ${meeting.chair_email}`);
    lines.push('');

    lines.push('## Decisions');
    if (decisions.length === 0) {
        lines.push('');
        lines.push('_No decisions recorded._');
    } else {
        for (const d of decisions) {
            lines.push('');
            const title = d.item_title ? `**${d.item_title}**` : '**(item)**';
            lines.push(`- ${title} — \`${d.decision_type}\``);
            lines.push(`  - ${d.decision_text}`);
            if (d.rationale) lines.push(`  - Rationale: ${d.rationale}`);
            if (d.owner_email) lines.push(`  - Owner: ${d.owner_email} · due ${fmtDate(d.due_date)}`);
            if (d.supersedes_id) lines.push(`  - Supersedes an earlier decision (${d.supersedes_id})`);
            lines.push(`  - Decided by ${d.decided_by}`);
        }
    }
    lines.push('');

    lines.push('## Deferred');
    if (deferredItems.length === 0) {
        lines.push('');
        lines.push('_Nothing deferred._');
    } else {
        lines.push('');
        for (const item of deferredItems) {
            lines.push(`- ${item.title}${item.reason ? ` — ${item.reason}` : ''}`);
        }
    }
    lines.push('');

    lines.push('## Blocked');
    if (blockedItems.length === 0) {
        lines.push('');
        lines.push('_Nothing blocked._');
    } else {
        lines.push('');
        for (const item of blockedItems) {
            lines.push(`- ${item.title}${item.blocked_reason ? ` — blocked on: ${item.blocked_reason}` : ''}`);
        }
    }
    lines.push('');

    lines.push('## Commitments still open');
    if (openCommitments.length === 0) {
        lines.push('');
        lines.push('_None._');
    } else {
        lines.push('');
        for (const c of openCommitments) {
            const overdue = c.age_days != null && c.age_days > 0 ? ` (**${c.age_days}d overdue**)` : '';
            lines.push(`- ${c.item_title ?? c.decision_text} — ${c.owner_email}, due ${fmtDate(c.due_date)}${overdue}`);
        }
    }
    lines.push('');
    return lines.join('\n');
}
