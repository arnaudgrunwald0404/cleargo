/**
 * Slack message templates for retro reminders
 */

import type { DayMarker } from '@/lib/success/types';

interface Epic {
  id: string;
  name: string;
  target_launch_date: string;
}

/**
 * Build Slack message for retro reminder
 */
export function buildRetroReminderMessage(
  epic: Epic,
  dayMarker: DayMarker,
  daysSinceLaunch: number
): any {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.clearcompany.com';
  const epicUrl = `${baseUrl}/epics/${epic.id}?tab=retro`;

  return {
    text: `📋 Retro Reminder: ${epic.name}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📋 Retro Reminder: ${epic.name}`,
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
            text: `*Retro Due:*\nT+${dayMarker} days`,
          },
          {
            type: 'mrkdwn',
            text: `*Launch Date:*\n${new Date(epic.target_launch_date).toLocaleDateString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Days Since Launch:*\n${daysSinceLaunch}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `The T+${dayMarker} retrospective is due for this epic. Please submit your retrospective to capture learnings and outcomes.`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Submit Retro',
              emoji: true,
            },
            style: 'primary',
            url: epicUrl,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Epic',
              emoji: true,
            },
            url: epicUrl,
          },
        ],
      },
    ],
  };
}

