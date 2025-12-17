/**
 * Slack notification message templates using Block Kit
 */

import type { SlackBlock } from '@/types/slack';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://launch-console.clearcompany.com';

/**
 * Stale Criterion Reminder
 */
export function buildStaleCriterionMessage(data: {
  launch_name: string;
  launch_id: string;
  criterion_label: string;
  criterion_id: string;
  days_stale: number;
  last_updated: string;
  decision_owner_name: string;
}): { text: string; blocks: SlackBlock[] } {
  return {
    text: `Reminder: "${data.criterion_label}" for ${data.launch_name} needs an update`,
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
          text: `*${data.launch_name}*\n_${data.criterion_label}_`,
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
            url: `${APP_URL}/launch/${data.launch_id}`,
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
export function buildLaunchRiskAlertMessage(data: {
  launch_name: string;
  launch_id: string;
  tier: string;
  risk_level: 'Low' | 'Medium' | 'High';
  readiness_score: number;
  days_to_launch: number;
  gate_blockers: number;
  owner_name: string;
}): { text: string; blocks: SlackBlock[] } {
  const riskEmoji = data.risk_level === 'High' ? '🔴' : data.risk_level === 'Medium' ? '🟡' : '🟢';
  const riskColor =
    data.risk_level === 'High' ? 'danger' : data.risk_level === 'Medium' ? 'warning' : 'good';

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
            url: `${APP_URL}/launch/${data.launch_id}`,
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
  launch_name: string;
  launch_id: string;
  verdict: 'Go' | 'Conditional Go' | 'No Go';
  decision_date: string;
  notes: string;
  conditions_count?: number;
  decided_by: string;
}): { text: string; blocks: SlackBlock[] } {
  const verdictEmoji = data.verdict === 'Go' ? '✅' : data.verdict === 'No Go' ? '❌' : '⚠️';

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
            url: `${APP_URL}/launch/${data.launch_id}`,
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
  high_risk_launches: Array<{
    name: string;
    id: string;
    tier: string;
    risk: string;
    days_to_launch: number;
    readiness: number;
  }>;
  upcoming_launches: Array<{
    name: string;
    id: string;
    tier: string;
    target_release_date: string;
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
  if (data.high_risk_launches.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🔴 High Risk Launches*',
      },
    });

    data.high_risk_launches.forEach((launch) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<${APP_URL}/launch/${launch.id}|${launch.name}>*\n${launch.tier} • ${launch.days_to_launch} days • ${Math.round(launch.readiness * 100)}% ready`,
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View',
            emoji: true,
          },
          url: `${APP_URL}/launch/${launch.id}`,
        },
      });
    });

    blocks.push({ type: 'divider' });
  }

  // Upcoming Launches
  if (data.upcoming_launches.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📅 Upcoming Launches (Next 30 Days)*',
      },
    });

    data.upcoming_launches.forEach((launch) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<${APP_URL}/launch/${launch.id}|${launch.name}>*\n${launch.tier} • Target: ${launch.target_release_date}`,
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
          text: 'View Portfolio Dashboard',
          emoji: true,
        },
        style: 'primary',
        url: `${APP_URL}/portfolio`,
      },
    ],
  });

  return {
    text: `Weekly Launch Readiness Digest - Week of ${data.week_of}`,
    blocks,
  };
}

/**
 * Launch Status Change
 */
export function buildLaunchStatusChangeMessage(data: {
  launch_name: string;
  launch_id: string;
  old_status: string;
  new_status: string;
  changed_by: string;
  reason?: string;
}): { text: string; blocks: SlackBlock[] } {
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
            url: `${APP_URL}/launch/${data.launch_id}`,
          },
        ],
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
