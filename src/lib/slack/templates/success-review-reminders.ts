/**
 * Slack message templates for weekly success review reminders
 */

import type { Epic } from '@/types/epics';
import { formatCohort1DateForSlack } from '@/lib/epic-cohort1-date';

export function buildSuccessReviewReminderMessage(metadata: {
  epic: Pick<Epic, 'id' | 'name' | 'target_launch_date' | 'off_schedule_release_date'>;
  daysSinceLastReview: number | null;
  lastReviewDate: string | null;
}): {
  text: string;
  blocks: unknown[];
} {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.clearcompany.com';
  const epicUrl = `${baseUrl}/epics/${metadata.epic.id}?tab=scorecard`;
  const launchText = formatCohort1DateForSlack(metadata.epic);
  const daysText =
    metadata.daysSinceLastReview === null
      ? 'never reviewed'
      : `${metadata.daysSinceLastReview} day${metadata.daysSinceLastReview === 1 ? '' : 's'} since last review`;

  const bodyLines = [
    `*Epic:* ${metadata.epic.name}`,
    `*Last review:* ${daysText}`,
  ];
  if (launchText) {
    bodyLines.push(`*Cohort 1 date:* ${launchText}`);
  }

  return {
    text: `Success review reminder: ${metadata.epic.name}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Success review reminder',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: bodyLines.join('\n'),
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Open scorecard',
            },
            url: epicUrl,
            action_id: 'open_scorecard',
          },
        ],
      },
    ],
  };
}
