/**
 * Slack message templates for scorecard alerts
 */

import type { EpicScorecard, ScorecardStatus } from '@/lib/success/types';

interface Epic {
  id: string;
  name: string;
  target_launch_date: string;
}

/**
 * Build Slack message for scorecard alert
 */
export function buildScorecardAlertMessage(
  epic: Epic,
  scorecard: EpicScorecard,
  alertType: 'AT_RISK' | 'MISSED'
): any {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.clearcompany.com';
  const scorecardUrl = `${baseUrl}/epics/${epic.id}?tab=scorecard`;

  const statusEmoji = alertType === 'MISSED' ? '🔴' : '🟡';
  const statusText = alertType === 'MISSED' ? 'Missed Targets' : 'At Risk';

  // Count metrics by status
  const missedCount = scorecard.metric_results.filter(m => m.status === 'MISSED').length;
  const atRiskCount = scorecard.metric_results.filter(m => m.status === 'AT_RISK').length;

  const metricSummary = [];
  if (missedCount > 0) {
    metricSummary.push(`${missedCount} metric${missedCount !== 1 ? 's' : ''} missed`);
  }
  if (atRiskCount > 0) {
    metricSummary.push(`${atRiskCount} metric${atRiskCount !== 1 ? 's' : ''} at risk`);
  }

  return {
    text: `${statusEmoji} Scorecard Alert: ${epic.name} - ${statusText}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${statusEmoji} Scorecard Alert: ${epic.name}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Epic:*\n${epic.name}`,
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${statusText}`,
          },
          {
            type: 'mrkdwn',
            text: `*Snapshot Date:*\n${new Date(scorecard.snapshot_date).toLocaleDateString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Metrics:*\n${metricSummary.join(', ') || 'No issues'}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `The latest scorecard shows that this epic is ${statusText.toLowerCase()}. Review the scorecard to see which metrics need attention.`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Scorecard',
              emoji: true,
            },
            style: 'primary',
            url: scorecardUrl,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Epic',
              emoji: true,
            },
            url: `${baseUrl}/epics/${epic.id}`,
          },
        ],
      },
    ],
  };
}

