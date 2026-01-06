/**
 * Slack notification message templates using Block Kit
 */

import type { SlackBlock } from '@/types/slack';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.clearcompany.com';

/**
 * Stale Criterion Reminder
 */
export function buildStaleCriterionMessage(data: {
  epic_name: string;
  epic_id: string;
  criterion_label: string;
  criterion_id: string;
  days_stale: number;
  last_updated: string;
  decision_owner_name: string;
}): { text: string; blocks: SlackBlock[] } {
  return {
    text: `Reminder: "${data.criterion_label}" for ${data.epic_name} needs an update`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⏰ Stale Criterion Reminder',
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
            text: "💡 This criterion hasn't been updated recently. Please review and update the status.",
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
            url: `${APP_URL}/epics/${data.epic_id}`,
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
              epic_id: data.epic_id,
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
export function buildLaunchRiskAlertMessage(data: {
  epic_name: string;
  epic_id: string;
  tier: string;
  risk_level: 'Low' | 'Medium' | 'High';
  readiness_score: number;
  days_to_launch: number;
  gate_blockers: number;
  owner_name: string;
}): { text: string; blocks: SlackBlock[] } {
  const riskEmoji = data.risk_level === 'High' ? '🔴' : data.risk_level === 'Medium' ? '🟡' : '🟢';

  return {
    text: `${riskEmoji} High Risk Alert: ${data.epic_name}`,
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
          text: `*${data.epic_name}*\n${data.tier} • ${data.days_to_launch} days to launch`,
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
              text: 'View Epic Details',
              emoji: true,
            },
            style: 'primary',
            url: `${APP_URL}/epics/${data.epic_id}`,
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
export function buildGoNoGoDecisionMessage(data: {
  epic_name: string;
  epic_id: string;
  verdict: 'Go' | 'Conditional Go' | 'No Go';
  decision_date: string;
  notes: string;
  conditions_count?: number;
  decided_by: string;
}): { text: string; blocks: SlackBlock[] } {
  const verdictEmoji = data.verdict === 'Go' ? '✅' : data.verdict === 'No Go' ? '❌' : '⚠️';

  return {
    text: `${verdictEmoji} Go/No-Go Decision: ${data.epic_name} - ${data.verdict}`,
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
          text: `*${data.epic_name}*`,
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
            url: `${APP_URL}/epics/${data.epic_id}`,
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
 * Leadership Digest
 */
export function buildLeadershipDigestMessage(data: {
  week_of: string;
  high_risk_epics: Array<{
    name: string;
    id: string;
    tier: string;
    risk: string;
    days_to_launch: number;
    readiness: number;
  }>;
  upcoming_epics: Array<{
    name: string;
    id: string;
    tier: string;
    target_launch_date: string;
  }>;
  total_active: number;
}): { text: string; blocks: SlackBlock[] } {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Weekly Launch Readiness Digest',
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Week of ${data.week_of} • ${data.total_active} active launches`,
        },
      ],
    },
    {
      type: 'divider',
    },
  ];

  // High Risk Launches
  if (data.high_risk_epics.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🔴 High Risk Launches*',
      },
    });

    data.high_risk_epics.forEach((epic) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<${APP_URL}/epics/${epic.id}|${epic.name}>*\n${epic.tier} • ${epic.days_to_launch} days • ${Math.round(epic.readiness * 100)}% ready`,
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View',
            emoji: true,
          },
          url: `${APP_URL}/epics/${epic.id}`,
        },
      });
    });

    blocks.push({ type: 'divider' });
  }

  // Upcoming Launches
  if (data.upcoming_epics.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📅 Upcoming Launches (Next 30 Days)*',
      },
    });

    data.upcoming_epics.forEach((epic) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<${APP_URL}/epics/${epic.id}|${epic.name}>*\n${epic.tier} • Target: ${epic.target_launch_date}`,
        },
      });
    });

    blocks.push({ type: 'divider' });
  }

  // Footer
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Epics',
          emoji: true,
        },
        style: 'primary',
        url: `${APP_URL}/epics`,
      },
    ],
  });

  return {
    text: `Weekly Launch Readiness Digest - Week of ${data.week_of}`,
    blocks,
  };
}

/**
 * Epic Status Change
 */
export function buildLaunchStatusChangeMessage(data: {
  epic_name: string;
  epic_id: string;
  old_status: string;
  new_status: string;
  changed_by: string;
  reason?: string;
}): { text: string; blocks: SlackBlock[] } {
  return {
    text: `Epic status changed: ${data.epic_name} is now ${data.new_status}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${data.epic_name}* status changed`,
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
              text: 'View Epic',
              emoji: true,
            },
            url: `${APP_URL}/epics/${data.epic_id}`,
          },
        ],
      },
    ],
  };
}

/**
 * URL Unfurl for epic links
 */
export function buildLaunchUnfurl(data: {
  epic_name: string;
  epic_id: string;
  tier: string;
  readiness_status: string;
  readiness_score: number;
  risk_level: string;
  target_launch_date: string;
  gate_summary: string;
}): SlackBlock[] {
  const riskEmoji = data.risk_level === 'High' ? '🔴' : data.risk_level === 'Medium' ? '🟡' : '🟢';

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${data.epic_name}*\n${data.tier} • Target: ${data.target_launch_date}`,
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
