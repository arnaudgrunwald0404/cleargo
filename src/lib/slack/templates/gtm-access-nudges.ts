import { formatDateOnlyForDisplay } from '@/lib/date-utils';
import type { GtmAccessPendingEpic } from '@/lib/services/gtmAccessNudgeService';

export function buildGtmAccessNudgeMessage(epics: GtmAccessPendingEpic[]): {
  text: string;
  blocks: unknown[];
} {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.clearcompany.com';
  const count = epics.length;
  const header =
    count === 1
      ? 'GTM access confirmation needed'
      : `GTM access confirmation needed (${count} launches)`;

  const lines = epics.map((e) => {
    const planned = formatDateOnlyForDisplay(e.plannedGtmYmd, { month: 'short', day: 'numeric' });
    const ago =
      e.daysSincePlanned === 0
        ? 'today'
        : e.daysSincePlanned === 1
          ? '1 day ago'
          : `${e.daysSincePlanned} days ago`;
    const url = `${baseUrl}/epics/${e.epicId}`;
    return `• <${url}|${e.epicName}> — planned ${planned} (${ago})`;
  });

  const releasesUrl = `${baseUrl}/epics`;

  return {
    text: header,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: header },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            count === 1
              ? 'Please confirm GTM org access when your launch is live.'
              : 'Please confirm GTM org access for these launches when they are live.',
            '',
            ...lines,
          ].join('\n'),
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: count === 1 ? 'Open launch' : 'Open Releases' },
            url: count === 1 ? `${baseUrl}/epics/${epics[0].epicId}` : releasesUrl,
            action_id: 'open_gtm_releases',
          },
        ],
      },
    ],
  };
}
