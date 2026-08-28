/**
 * App Home sections for the GTM launch work: the artifacts assigned to you, and
 * the Story Brief questions still waiting on you.
 *
 * The existing home already covers epics you own and criteria awaiting your
 * decision. It has never known about the `launch` table, so a PMM carrying six
 * artifacts saw nothing. These two sections close that, and give the gap-only
 * interview button somewhere permanent to live — a notification scrolls away, a
 * home tab does not.
 *
 * Pure builders; the queries live in launchHomeService.
 */

import type { ScheduleState } from '@/lib/launchCriteria';
import { buildInterviewButton, type InterviewTarget } from './story-brief-interview';

/** Kept small on purpose: a home tab is a prompt to act, not a backlog. */
export const MAX_HOME_ARTIFACTS = 8;
export const MAX_HOME_BRIEFS = 5;

export interface HomeArtifact {
    launchId: string;
    launchName: string;
    label: string;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
    startDate: string | null;
    dueDate: string | null;
    /**
     * The date lateness is measured from — the due date normally, grace-shifted
     * when the runway was compressed. Quoted instead of `dueDate` so an overdue
     * line never names a date from before the launch existed.
     */
    lateSince?: string | null;
    scheduleState: ScheduleState;
    gate: boolean;
    /** Artifacts waiting on this one. Only meaningful for a gate. */
    blocking: string[];
}

export interface UnassignedGroup {
    launchId: string;
    launchName: string;
    count: number;
}

export interface HomeBrief {
    target: InterviewTarget;
    openCount: number;
}

/**
 * Ordering is the whole value of this section: what is late and blocking others
 * first, what is merely late next, then what is open now, then the rest. A PMM
 * reading top-down is reading in the order the work actually matters.
 */
const STATE_RANK: Record<ScheduleState, number> = {
    late: 0,
    in_window: 1,
    compressed: 2,
    upcoming: 3,
    no_date: 4,
};

export function sortHomeArtifacts(items: HomeArtifact[]): HomeArtifact[] {
    return [...items].sort((a, b) => {
        // A late gate holding up other work outranks everything.
        const aBlocks = a.scheduleState === 'late' && a.gate && a.blocking.length > 0 ? 0 : 1;
        const bBlocks = b.scheduleState === 'late' && b.gate && b.blocking.length > 0 ? 0 : 1;
        if (aBlocks !== bBlocks) return aBlocks - bBlocks;

        const rank = STATE_RANK[a.scheduleState] - STATE_RANK[b.scheduleState];
        if (rank !== 0) return rank;

        // Then soonest due; undated last rather than first.
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.label.localeCompare(b.label);
    });
}

const STATE_ICON: Record<ScheduleState, string> = {
    late: '🔴',
    in_window: '🟢',
    // Not a failure yet: the release landed closer than the runway needs, so the
    // window never existed. Once the fair window from launch creation closes it
    // becomes 'late' like anything else.
    compressed: '🟠',
    upcoming: '⚪',
    no_date: '⚪',
};

export function describeArtifactState(item: HomeArtifact): string {
    switch (item.scheduleState) {
        case 'late': {
            const since = item.lateSince ?? item.dueDate;
            return since ? `Overdue since ${since}` : 'Overdue';
        }
        case 'in_window':
            return item.dueDate ? `Open now · due ${item.dueDate}` : 'Open now';
        case 'compressed':
            return item.lateSince
                ? `Window closed before this launch existed — start now, due ${item.lateSince}`
                : 'Window closed before this launch existed — start as soon as you can';
        case 'upcoming':
            return item.startDate ? `Starts ${item.startDate}` : 'Not started';
        case 'no_date':
            return 'No date set';
    }
}

export function buildArtifactBlocks(items: HomeArtifact[], appUrl: string): unknown[] {
    const actionable = items.filter((i) => i.status !== 'DONE');
    if (actionable.length === 0) {
        return [
            {
                type: 'section',
                text: { type: 'mrkdwn', text: '*Your launch artifacts*\n_Nothing assigned to you._' },
            },
        ];
    }

    const sorted = sortHomeArtifacts(actionable);
    const shown = sorted.slice(0, MAX_HOME_ARTIFACTS);

    const blocks: unknown[] = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Your launch artifacts (${actionable.length}):*`,
            },
        },
    ];

    for (const item of shown) {
        const gateMark = item.gate ? ' *· gate*' : '';
        const holding =
            item.gate && item.blocking.length > 0
                ? `\nHolding up: ${item.blocking.join(', ')}`
                : '';
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text:
                    `${STATE_ICON[item.scheduleState]} *${item.label}*${gateMark}\n` +
                    `${item.launchName} — ${describeArtifactState(item)}${holding}`,
            },
            accessory: {
                type: 'button',
                text: { type: 'plain_text', text: 'Open launch', emoji: true },
                url: `${appUrl}/gtm-launches/${item.launchId}`,
            },
        });
    }

    if (sorted.length > shown.length) {
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `+${sorted.length - shown.length} more not shown.`,
                },
            ],
        });
    }

    return blocks;
}

/**
 * One row per brief with unanswered gaps, each with its own interview button.
 * The count is stated so the ask is honest about its size before anyone clicks.
 */
export function buildStoryBriefQuestionBlocks(briefs: HomeBrief[]): unknown[] {
    const pending = briefs.filter((b) => b.openCount > 0);
    if (pending.length === 0) return [];

    const blocks: unknown[] = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text:
                    '*Story Brief questions waiting on you:*\n' +
                    '_Only the parts the draft could not support from Aha, Jira, or ClearGo history._',
            },
        },
    ];

    for (const brief of pending.slice(0, MAX_HOME_BRIEFS)) {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*${brief.target.epicName}* — ${brief.openCount} open`,
            },
        });
        blocks.push(buildInterviewButton(brief.target, brief.openCount));
    }

    return blocks;
}

/**
 * Unowned artifacts, grouped by launch. Separate from the to-do list on purpose:
 * these are not work this person owes, they are rows nobody has been named on,
 * and only the launch owner can fix that. Defaults can be set once per criterion
 * in settings, which is the durable fix rather than assigning row by row.
 */
export function buildUnassignedBlocks(groups: UnassignedGroup[], appUrl: string): unknown[] {
    const real = groups.filter((g) => g.count > 0);
    if (real.length === 0) return [];

    const total = real.reduce((sum, g) => sum + g.count, 0);
    const blocks: unknown[] = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text:
                    `*Needs an owner (${total}):*
` +
                    '_Nobody is named on these yet, so nobody is being reminded about them._',
            },
        },
    ];

    for (const g of real.slice(0, MAX_HOME_BRIEFS)) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*${g.launchName}* — ${g.count} unassigned` },
            accessory: {
                type: 'button',
                text: { type: 'plain_text', text: 'Assign owners', emoji: true },
                url: `${appUrl}/gtm-launches/${g.launchId}`,
            },
        });
    }

    return blocks;
}
