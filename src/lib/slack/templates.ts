/**
 * Slack notification message templates using Block Kit
 */

import type { SlackBlock } from '@/types/slack';
import type { GroupedCriteria } from './notification-groups';
import type { SlackThemeConfig } from './theme';
import { defaultSlackTheme } from './theme';
export { buildRetroReminderMessage } from './templates/retro-reminders';
export { buildScorecardAlertMessage } from './templates/scorecard-alerts';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://launch-console.clearcompany.com';

/**
 * Stale Criterion Reminder
 */
export function buildStaleCriterionMessage(
    data: {
        launch_name: string;
        launch_id: string;
        criterion_label: string;
        criterion_id: string;
        days_stale: number;
        last_updated: string;
        decision_owner_name: string;
        ai_personalized_nudge?: string | null;
    },
    theme: SlackThemeConfig = defaultSlackTheme
): { text: string; blocks: SlackBlock[] } {
    return {
        text: `Reminder: "${data.criterion_label}" for ${data.launch_name} needs an update`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `${theme.emojis.stale} Stale Criterion Reminder`,
                    emoji: true,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${data.launch_name}*\n_${data.criterion_label}_`,
                },
            },
            ...(data.ai_personalized_nudge ? [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*🤖 AI Nudge:*\n${data.ai_personalized_nudge}`,
                    },
                }
            ] : []),
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Days Stale:*\n${data.days_stale} days`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Last Updated:*\n${data.last_updated}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Decision Owner:*\n${data.decision_owner_name}`,
                    },
                ],
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: '💡 This criterion hasn\'t been updated recently. Please review and update the Go/No-Go score.',
                    },
                ],
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Update Status',
                            emoji: true,
                        },
                        style: 'primary',
                        url: `${APP_URL}/epics/${data.launch_id}`,
                        action_id: 'update_criterion',
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Snooze 7 Days',
                            emoji: true,
                        },
                        action_id: 'snooze_reminder',
                        value: JSON.stringify({
                            launch_id: data.launch_id,
                            criterion_id: data.criterion_id,
                            days: 7,
                        }),
                    },
                ],
            },
            {
                type: 'divider',
            },
        ],
    };
}

/**
 * Launch Risk Alert
 */
export function buildLaunchRiskAlertMessage(
    data: {
        launch_name: string;
        launch_id: string;
        tier: string;
        risk_level: 'Low' | 'Medium' | 'High';
        readiness_score: number;
        days_to_launch: number;
        gate_blockers: number;
        owner_name: string;
    },
    theme: SlackThemeConfig = defaultSlackTheme
): { text: string; blocks: SlackBlock[] } {
    const riskEmoji = data.risk_level === 'High' ? theme.emojis.risk.high : data.risk_level === 'Medium' ? theme.emojis.risk.medium : theme.emojis.risk.low;
    const riskColor = data.risk_level === 'High' ? 'danger' : data.risk_level === 'Medium' ? 'warning' : 'good';

    return {
        text: `${riskEmoji} High Risk Alert: ${data.launch_name}`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `${riskEmoji} Launch Risk Alert`,
                    emoji: true,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${data.launch_name}*\n${data.tier} • ${data.days_to_launch} days to launch`,
                },
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Risk Level:*\n${riskEmoji} ${data.risk_level}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Readiness:*\n${Math.round(data.readiness_score * 100)}%`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Gate Blockers:*\n${data.gate_blockers} criteria`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Owner:*\n${data.owner_name}`,
                    },
                ],
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: '⚠️ This launch requires immediate attention to address blockers and improve readiness.',
                    },
                ],
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View Launch Details',
                            emoji: true,
                        },
                        style: 'primary',
                        url: `${APP_URL}/epics/${data.launch_id}`,
                    },
                ],
            },
            {
                type: 'divider',
            },
        ],
    };
}

/**
 * Go/No-Go Decision Notification
 */
export function buildGoNoGoDecisionMessage(
    data: {
        launch_name: string;
        launch_id: string;
        verdict: 'Go' | 'Conditional Go' | 'No Go';
        decision_date: string;
        notes: string;
        conditions_count?: number;
        decided_by: string;
    },
    theme: SlackThemeConfig = defaultSlackTheme
): { text: string; blocks: SlackBlock[] } {
    const verdictEmoji = data.verdict === 'Go' ? theme.emojis.decision.go : data.verdict === 'No Go' ? theme.emojis.decision.noGo : theme.emojis.decision.conditional;

    return {
        text: `${verdictEmoji} Go/No-Go Decision: ${data.launch_name} - ${data.verdict}`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `${verdictEmoji} Go/No-Go Decision`,
                    emoji: true,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${data.launch_name}*`,
                },
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Decision:*\n${verdictEmoji} ${data.verdict}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Date:*\n${data.decision_date}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Decided By:*\n${data.decided_by}`,
                    },
                    ...(data.conditions_count
                        ? [
                            {
                                type: 'mrkdwn',
                                text: `*Conditions:*\n${data.conditions_count} items`,
                            },
                        ]
                        : []),
                ],
            },
            ...(data.notes
                ? [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*Notes:*\n${data.notes}`,
                        },
                    },
                ]
                : []),
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View Full Details',
                            emoji: true,
                        },
                        url: `${APP_URL}/epics/${data.launch_id}`,
                    },
                ],
            },
            {
                type: 'divider',
            },
        ],
    };
}

/**
 * Weekly Release Readiness Status Update
 * High-level overview: last 2 releases (metrics, red flags) and next releases (readiness status, red flags).
 * Shows up to 4 next releases to ensure important releases with delays/issues are included.
 */
export function buildLeadershipDigestMessage(
    data: {
        week_of: string;
        narrative?: string | null;
        last_releases?: Array<{
            release_name: string;
            launch_date: string | null;
            average_readiness: number;
            metrics_count: number;
            red_flags: { no_metrics: boolean; no_progression: boolean };
            high_risk_epics?: Array<{ name: string; id: string; tier: string | null; risk_level: string | null; readiness: number }>;
            best_epics?: Array<{ name: string; id: string; scorecard_status: string | null; scorecard_date?: string }>;
            worst_epics?: Array<{ name: string; id: string; scorecard_status: string | null; scorecard_date?: string }>;
            above_target_epics?: Array<{ name: string; id: string; percent_of_goal: number }>;
            no_metrics_epics?: Array<{ name: string; id: string }>;
            no_progression_epics?: Array<{ name: string; id: string }>;
        }>;
        next_releases?: Array<{
            release_name: string;
            launch_date: string | null;
            readiness_status: string;
            readiness_breakdown: { go: number; conditional_go: number; no_go: number; not_evaluated: number };
            total_criteria_overdue?: number;
            gate_red_count?: number;
            gate_yellow_count?: number;
            high_risk_epics?: Array<{ name: string; id: string; tier: string | null; risk_level: string | null; readiness: number; target_launch_date?: string | null }>;
            red_flags: Array<{
                epic_name: string;
                epic_id: string;
                gate_blockers: number;
                overdue_criteria: number;
                readiness_score: number;
                risk_level: string | null;
            }>;
        }>;
    },
    theme: SlackThemeConfig = defaultSlackTheme
): { text: string; blocks: SlackBlock[] } {
    const refDate = new Date();
    const daysAgo = (dateStr: string | null): number | null => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        return Math.floor((refDate.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
    };
    const daysFromNow = (dateStr: string | null): number | null => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        return Math.floor((d.getTime() - refDate.getTime()) / (24 * 60 * 60 * 1000));
    };

    const blocks: SlackBlock[] = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: 'Weekly Release Readiness Status Update',
                emoji: true,
            },
        },
        {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `Week of ${data.week_of}` }],
        },
    ];
    if (data.narrative && data.narrative.trim()) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: data.narrative.trim() },
        });
    }
    // No divider between "Week of" and sections

    // ---- Next 2 Releases FIRST (upcoming releases - most important) ----
    blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*How are the next 2 releases shaping up?*' },
    });

    // CRITICAL: Filter out any past releases from next_releases (defensive check)
    // Past releases should only appear in last_releases section
    const todayForFilter = new Date();
    todayForFilter.setHours(0, 0, 0, 0);
    const filteredNextReleases = (data.next_releases || []).filter((release) => {
        if (!release.launch_date) {
            return true; // Include releases without dates (they might be future releases)
        }
        const launchDate = new Date(release.launch_date);
        launchDate.setHours(0, 0, 0, 0);
        return launchDate >= todayForFilter; // Only include future or today's releases
    });

    let shownGoNoGo = false;
    if (filteredNextReleases.length > 0) {
        filteredNextReleases.forEach((release) => {
            const launchDateStr = release.launch_date
                ? new Date(release.launch_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Date TBD';
            const inDays = daysFromNow(release.launch_date);
            // Only show positive days (future) or "today" - never show negative days (past releases shouldn't be here)
            const dateSuffix = inDays !== null && inDays > 0 ? ` = in ${inDays} days` : (inDays === 0 ? ' = today' : '');
            const goNoGoHint =
                inDays !== null && inDays >= 0 && inDays < 28 && !shownGoNoGo ? '  ·  _go/no-go decision time!_' : '';
            if (inDays !== null && inDays >= 0 && inDays < 28) shownGoNoGo = true;

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${release.release_name}*  ·  ${launchDateStr}${dateSuffix}${goNoGoHint}`,
                },
            });
            const breakdown = release.readiness_breakdown;
            const totalEpics = breakdown.go + breakdown.conditional_go + breakdown.no_go + breakdown.not_evaluated;
            blocks.push({
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: totalEpics
                            ? `✅ ${breakdown.go} Go  ·  ⚠️ ${breakdown.conditional_go} Conditional  ·  ❌ ${breakdown.no_go} No-Go  ·  ⏸️ ${breakdown.not_evaluated} Not evaluated`
                            : 'No epics in this release',
                    },
                ],
            });
            const nextHighRisk = (release as { high_risk_epics?: Array<{ name: string; id: string; tier: string | null; risk_level: string | null; readiness: number; target_launch_date?: string | null }> }).high_risk_epics ?? [];
            if (nextHighRisk.length > 0) {
                const highRiskLines = nextHighRisk
                    .map((e) => {
                        const riskBadge = e.risk_level === 'HIGH' ? '🔴' : '🟡';
                        return `${riskBadge} <${APP_URL}/epics/${e.id}|${e.name}> (${e.tier || '?'}) ${e.readiness}%`;
                    })
                    .join('\n');
                blocks.push({
                    type: 'section',
                    text: { type: 'mrkdwn', text: `_High risk:_\n${highRiskLines}` },
                });
            }
            const totalOverdue = (release as { total_criteria_overdue?: number }).total_criteria_overdue ?? 0;
            const gateRed = (release as { gate_red_count?: number }).gate_red_count ?? 0;
            const gateYellow = (release as { gate_yellow_count?: number }).gate_yellow_count ?? 0;
            const nextRedFlags: string[] = [];
            if (totalOverdue > 0) nextRedFlags.push(`• ${totalOverdue} criteria overdue`);
            if (gateRed > 0) nextRedFlags.push(`• ${gateRed} gate criteria at No-Go (red)`);
            if (gateYellow > 0) nextRedFlags.push(`• ${gateYellow} gate criteria conditional (yellow)`);
            if (nextRedFlags.length > 0) {
                blocks.push({
                    type: 'section',
                    text: { type: 'mrkdwn', text: `_Red flags:_\n${nextRedFlags.join('\n')}` },
                });
            } else if (release.red_flags.length > 0) {
                const epicFlags = release.red_flags
                    .slice(0, 5)
                    .map((flag) => {
                        const parts = [];
                        if (flag.gate_blockers > 0) parts.push(`${flag.gate_blockers} gate blocker(s)`);
                        if (flag.overdue_criteria > 0) parts.push(`${flag.overdue_criteria} overdue`);
                        return `<${APP_URL}/epics/${flag.epic_id}|${flag.epic_name}>: ${parts.join(', ')}`;
                    })
                    .join('\n');
                blocks.push({
                    type: 'section',
                    text: { type: 'mrkdwn', text: `_Epics with issues:_\n${epicFlags}` },
                });
            }
        });
    } else {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: '_No upcoming releases in the schedule._' },
        });
    }

    blocks.push({ type: 'divider' });

    // ---- Recent Releases SECOND (past releases) ----
    blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*How are the recent releases doing?*' },
    });

    if (data.last_releases && data.last_releases.length > 0) {
        data.last_releases.forEach((release) => {
            const launchDateStr = release.launch_date
                ? new Date(release.launch_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Date TBD';
            const ago = daysAgo(release.launch_date);
            const dateSuffix = ago !== null ? ` = ${ago} days ago` : '';
            const retroLabel =
                ago === 30 ? 'first' : ago === 60 ? 'second' : ago === 90 ? 'third' : null;
            const retroHint =
                retroLabel !== null ? `  ·  *🔍 time for ${retroLabel} retro*` : '';
            const metricsCount = (release as { metrics_count?: number }).metrics_count ?? 0;

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${release.release_name}*  ·  ${launchDateStr}${dateSuffix}${retroHint}`,
                },
            });
            blocks.push({
                type: 'context',
                elements: [
                    { type: 'mrkdwn', text: `Avg readiness *${release.average_readiness}%*  ·  *${metricsCount}* metrics tracked` },
                ],
            });
            const lastHighRisk = (release as { high_risk_epics?: Array<{ name: string; id: string; tier: string | null; risk_level: string | null; readiness: number }> }).high_risk_epics ?? [];
            if (lastHighRisk.length > 0) {
                const highRiskLines = lastHighRisk
                    .map((e) => {
                        const riskBadge = e.risk_level === 'HIGH' ? '🔴' : '🟡';
                        return `${riskBadge} <${APP_URL}/epics/${e.id}|${e.name}> (${e.tier || '?'}) ${e.readiness}%`;
                    })
                    .join('\n');
                blocks.push({
                    type: 'section',
                    text: { type: 'mrkdwn', text: `_High risk:_\n${highRiskLines}` },
                });
            }
            const noMetricsEpics = (release as { no_metrics_epics?: Array<{ name: string; id: string }> }).no_metrics_epics ?? [];
            const noProgressionEpics = (release as { no_progression_epics?: Array<{ name: string; id: string }> }).no_progression_epics ?? [];
            const redFlagLines: string[] = [];
            for (const e of noMetricsEpics) {
                redFlagLines.push(`<${APP_URL}/epics/${e.id}|${e.name}> no metric`);
            }
            for (const e of noProgressionEpics) {
                redFlagLines.push(`<${APP_URL}/epics/${e.id}|${e.name}> no progression on metric`);
            }
            if (redFlagLines.length > 0) {
                blocks.push({
                    type: 'section',
                    text: { type: 'mrkdwn', text: `_Red flags:_\n${redFlagLines.join('\n')}` },
                });
            }
            const aboveTarget = (release as { above_target_epics?: Array<{ name: string; id: string; percent_of_goal: number }> }).above_target_epics ?? [];
            if (aboveTarget.length > 0) {
                const aboveLines = aboveTarget
                    .map((e) => `<${APP_URL}/epics/${e.id}|${e.name}> ${e.percent_of_goal}% of goal`)
                    .join('\n');
                blocks.push({
                    type: 'section',
                    text: { type: 'mrkdwn', text: `_Above target:_\n${aboveLines}` },
                });
            }
        });
    } else {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: '_No past releases in the schedule._' },
        });
    }

    blocks.push({
        type: 'actions',
        elements: [
            {
                type: 'button',
                text: { type: 'plain_text', text: 'View Portfolio Dashboard', emoji: true },
                style: 'primary',
                url: `${APP_URL}/epics`,
            },
        ],
    });

    return {
        text: `Weekly Release Readiness Status Update - Week of ${data.week_of}`,
        blocks,
    };
}

/**
 * Launch Status Change
 */
export function buildLaunchStatusChangeMessage(
    data: {
        launch_name: string;
        launch_id: string;
        old_status: string;
        new_status: string;
        changed_by: string;
        reason?: string;
    },
    theme: SlackThemeConfig = defaultSlackTheme
): { text: string; blocks: SlackBlock[] } {
    return {
        text: `Launch status changed: ${data.launch_name} is now ${data.new_status}`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${data.launch_name}* status changed`,
                },
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Previous:*\n${data.old_status}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Current:*\n${data.new_status}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Changed By:*\n${data.changed_by}`,
                    },
                ],
            },
            ...(data.reason
                ? [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*Reason:*\n${data.reason}`,
                        },
                    },
                ]
                : []),
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View Launch',
                            emoji: true,
                        },
                        url: `${APP_URL}/epics/${data.launch_id}`,
                    },
                ],
            },
        ],
    };
}

/**
 * Delegation Notification
 */
export function buildDelegationMessage(
    data: {
        epic_name: string;
        epic_id: string;
        task_label: string;
        category: string;
        delegation_type: string;
        delegated_by: string;
        epic_url?: string;
    },
    theme: SlackThemeConfig = defaultSlackTheme
): { text: string; blocks: SlackBlock[] } {
    const delegationTypeLabels: Record<string, string> = {
        'SINGLE_TASK': 'This task only',
        'CATEGORY_EXCLUDING_GATES': `All ${data.category} tasks (excluding GATE)`,
        'CATEGORY_INCLUDING_GATES': `All ${data.category} tasks (including GATE)`,
        'TEMPLATE_EXCLUDING_GATES': `All future epics - ${data.category} (excluding GATE)`,
        'TEMPLATE_INCLUDING_GATES': `All future epics - ${data.category} (including GATE)`,
    };

    return {
        text: `You've been assigned to approve: ${data.task_label} for ${data.epic_name}`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: '📋 Approval Task Delegated',
                    emoji: true,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${data.epic_name}*\n_${data.task_label}_`,
                },
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Category:*\n${data.category}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Delegation Scope:*\n${delegationTypeLabels[data.delegation_type] || data.delegation_type}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Delegated By:*\n${data.delegated_by}`,
                    },
                ],
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View Epic',
                            emoji: true,
                        },
                        style: 'primary',
                        url: data.epic_url || `${APP_URL}/epics/${data.epic_id}`,
                        action_id: 'view_epic',
                    },
                ],
            },
            {
                type: 'divider',
            },
        ],
    };
}

/**
 * URL Unfurl for launch links
 */
export function buildLaunchUnfurl(data: {
    launch_name: string;
    launch_id: string;
    tier: string;
    readiness_status: string;
    readiness_score: number;
    risk_level: string;
    target_release_date: string;
    gate_summary: string;
}): SlackBlock[] {
    const riskEmoji = data.risk_level === 'High' ? '🔴' : data.risk_level === 'Medium' ? '🟡' : '🟢';

    return [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*${data.launch_name}*\n${data.tier} • Target: ${data.target_release_date}`,
            },
        },
        {
            type: 'section',
            fields: [
                {
                    type: 'mrkdwn',
                    text: `*Status:*\n${data.readiness_status}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Readiness:*\n${Math.round(data.readiness_score * 100)}%`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Risk:*\n${riskEmoji} ${data.risk_level}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Gates:*\n${data.gate_summary}`,
                },
            ],
        },
    ];
}

/**
 * Criteria Assignment Notification (grouped by epic and assignee)
 */
export function buildCriteriaAssignmentMessage(
    groupedCriteria: GroupedCriteria,
    theme: SlackThemeConfig = defaultSlackTheme
): { text: string; blocks: SlackBlock[] } {
    const criteriaList = groupedCriteria.criteria
        .map((c) => {
            const dueDateText = c.due_date ? ` (Due: ${c.due_date})` : '';
            return `• ${c.label}${dueDateText}`;
        })
        .join('\n');

    return {
        text: `You've been assigned ${groupedCriteria.criteria.length} criteria for ${groupedCriteria.epic_name}`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `${theme.emojis.assignment} New Criteria Assigned`,
                    emoji: true,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${groupedCriteria.epic_name}*\nYou've been assigned ${groupedCriteria.criteria.length} criteria to review:`,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: criteriaList,
                },
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View Epic',
                            emoji: true,
                        },
                        style: 'primary',
                        url: `${APP_URL}/epics/${groupedCriteria.epic_id}`,
                        action_id: 'view_epic',
                    },
                ],
            },
            {
                type: 'divider',
            },
        ],
    };
}

/**
 * Criteria Nudge Notification (grouped by epic, due date, and assignee)
 * Now supports combined format with multiple epics and criteria
 */
export function buildCriteriaNudgeMessage(
    groupedCriteria: GroupedCriteria | { release_groups?: any[]; epic_groups?: any[]; criteria?: any[]; total_criteria_count?: number },
    nudgeType: '1_week_before' | 'on_due_date' | 'daily_after' | 'combined',
    theme: SlackThemeConfig = defaultSlackTheme
): { text: string; blocks: SlackBlock[] } {
    // Handle new combined format
    if (nudgeType === 'combined' && 'epic_groups' in groupedCriteria && groupedCriteria.epic_groups) {
        return buildCombinedCriteriaNudgeMessage(groupedCriteria as any, theme);
    }

    // Original format (backward compatibility)
    const dueDate = (groupedCriteria as GroupedCriteria).criteria[0]?.due_date;
    if (!dueDate) {
        throw new Error('Cannot build nudge message without due date');
    }

    const dueDateObj = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDateNormalized = new Date(dueDateObj);
    dueDateNormalized.setHours(0, 0, 0, 0);

    const daysDiff = Math.ceil((dueDateNormalized.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let headerText: string;
    let urgencyEmoji: string;
    let urgencyColor: 'danger' | 'warning' | undefined;
    let contextText: string;

    if (nudgeType === '1_week_before') {
        headerText = `${theme.emojis.nudge.weekBefore} Criteria Due in 1 Week`;
        urgencyEmoji = theme.emojis.nudge.weekBefore;
        urgencyColor = 'warning';
        contextText = `These criteria are due in ${daysDiff} day${daysDiff !== 1 ? 's' : ''}. Please review and update their status.`;
    } else if (nudgeType === 'on_due_date') {
        headerText = `${theme.emojis.nudge.dueToday} Criteria Due Today`;
        urgencyEmoji = theme.emojis.nudge.dueToday;
        urgencyColor = 'warning';
        contextText = 'These criteria are due today. Please review and update their status.';
    } else {
        // daily_after
        const daysOverdue = Math.abs(daysDiff);
        headerText = `${theme.emojis.nudge.overdue} Overdue Criteria (${daysOverdue} day${daysOverdue !== 1 ? 's' : ''})`;
        urgencyEmoji = theme.emojis.nudge.overdue;
        urgencyColor = 'danger';
        contextText = `These criteria are ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue. Please update their status as soon as possible.`;
    }

    const criteriaList = (groupedCriteria as GroupedCriteria).criteria
        .map((c) => `• ${c.label}`)
        .join('\n');

    const blocks: SlackBlock[] = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: headerText,
                emoji: true,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*${(groupedCriteria as GroupedCriteria).epic_name}*\nDue Date: ${dueDate}`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: criteriaList,
            },
        },
        {
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `💡 ${contextText}`,
                },
            ],
        },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: 'Update Status',
                        emoji: true,
                    },
                    style: urgencyColor === 'danger' ? 'danger' : 'primary',
                    url: `${APP_URL}/epics/${(groupedCriteria as GroupedCriteria).epic_id}`,
                    action_id: 'update_criteria',
                },
            ],
        },
        {
            type: 'divider',
        },
    ];

    return {
        text: `${urgencyEmoji} ${(groupedCriteria as GroupedCriteria).criteria.length} criteria ${nudgeType === 'daily_after' ? 'overdue' : 'due'} for ${(groupedCriteria as GroupedCriteria).epic_name}`,
        blocks,
    };
}

/**
 * Build combined criteria nudge message with multiple epics and criteria, ordered by urgency
 * Now supports release grouping
 */
function buildCombinedCriteriaNudgeMessage(
    data: { release_groups?: any[]; epic_groups: any[]; criteria: any[]; total_criteria_count: number },
    theme: SlackThemeConfig = defaultSlackTheme
): { text: string; blocks: SlackBlock[] } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate urgency breakdown
    let overdueCount = 0;
    let dueTodayCount = 0;
    let dueSoonCount = 0;
    let mostUrgentDays = 0;

    for (const c of data.criteria) {
        if (!c.due_date) continue;
        const dueDate = new Date(c.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff < 0) {
            overdueCount++;
            if (daysDiff < mostUrgentDays) mostUrgentDays = daysDiff;
        } else if (daysDiff === 0) {
            dueTodayCount++;
        } else if (daysDiff <= 7) {
            dueSoonCount++;
        }
    }

    // Determine header based on most urgent items
    let headerText: string;
    let urgencyEmoji: string;
    let urgencyColor: 'danger' | 'warning' | undefined;
    
    if (overdueCount > 0) {
        const daysOverdue = Math.abs(mostUrgentDays);
        headerText = `${theme.emojis.nudge.overdue} ${data.total_criteria_count} Criteria Need Your Attention`;
        urgencyEmoji = theme.emojis.nudge.overdue;
        urgencyColor = 'danger';
    } else if (dueTodayCount > 0) {
        headerText = `${theme.emojis.nudge.dueToday} ${data.total_criteria_count} Criteria Need Your Attention`;
        urgencyEmoji = theme.emojis.nudge.dueToday;
        urgencyColor = 'warning';
    } else {
        headerText = `${theme.emojis.nudge.weekBefore} ${data.total_criteria_count} Criteria Need Your Attention`;
        urgencyEmoji = theme.emojis.nudge.weekBefore;
        urgencyColor = 'warning';
    }

    const blocks: SlackBlock[] = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: headerText,
                emoji: true,
            },
        },
    ];

    // Add summary
    const summaryParts: string[] = [];
    if (overdueCount > 0) summaryParts.push(`${overdueCount} overdue`);
    if (dueTodayCount > 0) summaryParts.push(`${dueTodayCount} due today`);
    if (dueSoonCount > 0) summaryParts.push(`${dueSoonCount} due soon`);
    
    if (summaryParts.length > 0) {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Summary:* ${summaryParts.join(', ')}`,
            },
        });
    }

    // Group by release if available, otherwise by epic
    if (data.release_groups && data.release_groups.length > 0) {
        for (const releaseGroup of data.release_groups) {
            // Add release header
            let releaseHeader = '';
            if (releaseGroup.release_name) {
                releaseHeader = `*Release ${releaseGroup.release_name}*`;
                if (releaseGroup.release_date) {
                    const releaseDate = new Date(releaseGroup.release_date);
                    releaseDate.setHours(0, 0, 0, 0);
                    const daysDiff = Math.ceil((releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysDiff < 0) {
                        releaseHeader += ` (${Math.abs(daysDiff)} day${Math.abs(daysDiff) !== 1 ? 's' : ''} ago)`;
                    } else if (daysDiff === 0) {
                        releaseHeader += ' (Today)';
                    } else {
                        releaseHeader += ` (in ${daysDiff} day${daysDiff !== 1 ? 's' : ''})`;
                    }
                }
            } else {
                releaseHeader = '*No Release Assigned*';
            }
            
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: releaseHeader,
                },
            });
            
            // Add epics within this release
            for (const epicGroup of releaseGroup.epic_groups) {
                // Calculate days until/since due for this epic's most urgent criterion
                const epicCriteria = epicGroup.criteria.sort((a: any, b: any) => {
                    const dateA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
                    const dateB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
                    return dateA - dateB;
                });
                
                const mostUrgentCriterion = epicCriteria[0];
                const dueDate = mostUrgentCriterion?.due_date ? new Date(mostUrgentCriterion.due_date) : null;
                
                let epicUrgencyText = '';
                if (dueDate) {
                    dueDate.setHours(0, 0, 0, 0);
                    const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysDiff < 0) {
                        epicUrgencyText = ` *(${Math.abs(daysDiff)} day${Math.abs(daysDiff) !== 1 ? 's' : ''} overdue)*`;
                    } else if (daysDiff === 0) {
                        epicUrgencyText = ' *(Due today)*';
                    } else if (daysDiff <= 7) {
                        epicUrgencyText = ` *(Due in ${daysDiff} day${daysDiff !== 1 ? 's' : ''})*`;
                    }
                }

                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `  • *${epicGroup.epic_name}*${epicUrgencyText}\n${epicGroup.criteria.map((c: any) => `    • ${c.label}`).join('\n')}`,
                    },
                    accessory: {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View Epic',
                            emoji: true,
                        },
                        url: `${APP_URL}/epics/${epicGroup.epic_id}`,
                        action_id: `view_epic_${epicGroup.epic_id}`,
                    },
                });
            }
            
            // Add divider between releases
            if (releaseGroup !== data.release_groups[data.release_groups.length - 1]) {
                blocks.push({
                    type: 'divider',
                });
            }
        }
    } else {
        // Fallback to epic grouping (backward compatibility)
        for (const epicGroup of data.epic_groups) {
            // Calculate days until/since due for this epic's most urgent criterion
            const epicCriteria = epicGroup.criteria.sort((a: any, b: any) => {
                const dateA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
                const dateB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
                return dateA - dateB;
            });
            
            const mostUrgentCriterion = epicCriteria[0];
            const dueDate = mostUrgentCriterion?.due_date ? new Date(mostUrgentCriterion.due_date) : null;
            
            let epicUrgencyText = '';
            if (dueDate) {
                dueDate.setHours(0, 0, 0, 0);
                const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (daysDiff < 0) {
                    epicUrgencyText = ` *(${Math.abs(daysDiff)} day${Math.abs(daysDiff) !== 1 ? 's' : ''} overdue)*`;
                } else if (daysDiff === 0) {
                    epicUrgencyText = ' *(Due today)*';
                } else if (daysDiff <= 7) {
                    epicUrgencyText = ` *(Due in ${daysDiff} day${daysDiff !== 1 ? 's' : ''})*`;
                }
            }

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${epicGroup.epic_name}*${epicUrgencyText}\n${epicGroup.criteria.map((c: any) => `• ${c.label}`).join('\n')}`,
                },
                accessory: {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: 'View Epic',
                        emoji: true,
                    },
                    url: `${APP_URL}/epics/${epicGroup.epic_id}`,
                    action_id: `view_epic_${epicGroup.epic_id}`,
                },
            });
        }
    }

    // Add action button
    blocks.push({
        type: 'actions',
        elements: [
            {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: 'View All My Items',
                    emoji: true,
                },
                style: urgencyColor === 'danger' ? 'danger' : 'primary',
                url: `${APP_URL}/my-items`,
                action_id: 'view_all_items',
            },
        ],
    });

    blocks.push({
        type: 'divider',
    });

    const releaseCount = data.release_groups?.length || 0;
    const epicCount = data.epic_groups?.length || 0;
    const text = releaseCount > 0
        ? `${urgencyEmoji} ${data.total_criteria_count} Criteria Need Your Attention across ${releaseCount} release${releaseCount !== 1 ? 's' : ''}`
        : `${urgencyEmoji} ${data.total_criteria_count} Criteria Need Your Attention across ${epicCount} epic${epicCount !== 1 ? 's' : ''}`;
    
    return {
        text,
        blocks,
    };
}

/**
 * Criterion Comment or Attachment Notification
 */
export function buildCriterionCommentOrAttachmentMessage(
    data: {
        epic_name: string;
        epic_id: string;
        criterion_label: string;
        criterion_status_id: string;
        added_by_name: string;
        has_comment: boolean;
        has_attachment: boolean;
    },
    theme: SlackThemeConfig = defaultSlackTheme
): { text: string; blocks: SlackBlock[] } {
    const actionTypes: string[] = [];
    if (data.has_comment) actionTypes.push('comment');
    if (data.has_attachment) actionTypes.push('attachment');
    const actionText = actionTypes.join(' and ');

    return {
        text: `${data.added_by_name} added a ${actionText} on "${data.criterion_label}" for ${data.epic_name}`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `${theme.emojis.comment} New Comment or Attachment`,
                    emoji: true,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${data.epic_name}*\n_${data.criterion_label}_`,
                },
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Added By:*\n${data.added_by_name}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Type:*\n${actionTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' and ')}`,
                    },
                ],
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View Comments & Attachments',
                            emoji: true,
                        },
                        style: 'primary',
                        url: `${APP_URL}/epics/${data.epic_id}?criterion=${data.criterion_status_id}&tab=comments`,
                        action_id: 'view_comments',
                    },
                ],
            },
            {
                type: 'divider',
            },
        ],
    };
}
