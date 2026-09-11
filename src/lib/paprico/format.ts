import { formatDateOnlyForDisplay } from '@/lib/date-utils';
import { agendaGroupTitle, groupAgendaItemsByEpic } from './agenda';
import type {
    AgendaEpicGroup,
    AgendaItem,
    OpenCommitment,
    PapricoAgenda,
    PapricoDecision,
    PapricoMeeting,
} from './types';

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
 * One epic, one bullet, with its open criteria nested underneath.
 *
 * The circulated agenda is where the per-criterion fan-out hurt most: the
 * 2026-09-18 run pasted 78 bullets into #paprico for 48 epics, so the same
 * product appeared up to five times and the list read as five decisions.
 *
 * A group with no epic behind it (a standing item, an orphan) is still a single
 * bullet, rendered the way it always was -- there is no criterion list to nest.
 */
function agendaGroupLines(group: AgendaEpicGroup): string[] {
    if (!group.epic_id || group.items.length === 1) {
        return [`• ${agendaRowLine(group.items[0])}`];
    }

    const header: string[] = [`*${agendaGroupTitle(group)}*`];
    if (group.tier) header.push(group.tier.replace('TIER_', 'Tier '));
    if (group.release_name) header.push(group.release_name);
    if (group.stage_name) header.push(`stage: ${group.stage_name} (${fmtDate(group.stage_date)})`);
    if (group.band) header.push(bandLabel(group.band));
    if (group.owner_email) header.push(`owner: ${group.owner_email}`);
    // Say how much of the block is actually budgeted, for the same reason the
    // agenda total carries its unbudgeted count rather than hiding it in a sum.
    if (group.time_box_minutes > 0) header.push(`${group.time_box_minutes} min`);
    if (group.unbudgeted_item_count > 0) {
        header.push(`${group.unbudgeted_item_count} unbudgeted`);
    }

    const lines = [`• ${header.join(' · ')}`];
    for (const item of group.items) {
        lines.push(`    ◦ ${item.criterion_label ?? item.title}`);
    }
    return lines;
}

function agendaSectionLines(items: AgendaItem[]): string[] {
    return groupAgendaItemsByEpic(items).flatMap(agendaGroupLines);
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
        lines.push(...agendaSectionLines(agenda.overdue_critical));
    }
    lines.push('');

    lines.push('*3. Approaching*');
    if (agenda.approaching.length === 0) {
        lines.push('_Nothing approaching a stage with pricing, naming or forecast criteria open._');
    } else {
        lines.push(...agendaSectionLines(agenda.approaching));
    }
    lines.push('');

    lines.push('*4. Standing items*');
    if (agenda.standing.length === 0) {
        lines.push('_None._');
    } else {
        for (const item of agenda.standing) lines.push(`• ${agendaRowLine(item)}`);
    }

    const unbudgeted = agenda.unbudgeted_item_count ?? 0;
    if (agenda.total_time_box_minutes > 0 || unbudgeted > 0) {
        lines.push('');
        // The unbudgeted count has to travel with the total: without it a 52 min
        // total against a 90 min meeting reads as spare capacity when most of
        // the items simply have no box.
        const unbudgetedNote =
            unbudgeted > 0 ? ` · ${unbudgeted} item${unbudgeted === 1 ? '' : 's'} unbudgeted` : '';
        lines.push(
            `Time boxed: ${agenda.total_time_box_minutes} min of ${meeting.meeting_length_minutes} min${unbudgetedNote}`
        );
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
