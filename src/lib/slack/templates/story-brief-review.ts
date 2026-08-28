/**
 * Slack message for Story Brief completeness nudges.
 *
 * Sent to PMs whose epics have incomplete Story Briefs, reminding them of
 * gaps, days-to-launch, and how to fill in the brief via MCP.
 */

import type { SectionGap } from '@/lib/story-brief/completeness';

export interface StoryBriefReviewMeta {
  epic_id: string;
  epic_name: string;
  launch_name: string;
  launch_id: string;
  daysToLaunch: number | null;
  completenessScore: number;
  completeSections: number;
  totalSections: number;
  gaps: SectionGap[];
  /** If this is a re-nudge, how many times we've already notified. */
  notificationCount: number;
}

/**
 * Build a Story Brief review nudge message (blocks + text fallback).
 */
export function buildStoryBriefReviewMessage(m: StoryBriefReviewMeta): {
  text: string;
  blocks: unknown[];
} {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.clearcompany.com';
  const epicUrl = `${baseUrl}/epics/${m.epic_id}`;
  const launchUrl = `${baseUrl}/gtm-launches/${m.launch_id}`;
  const mcpSetupUrl = `${baseUrl}/settings#mcp-setup`;

  // Header
  const pct = Math.round(m.completenessScore * 100);
  const header = `📝 *${m.epic_name}* Story Brief is ${pct}% complete`;

  // Days-to-launch line
  let timeline = '';
  if (m.daysToLaunch !== null) {
    if (m.daysToLaunch <= 0) {
      timeline = `⚠️ Launch date has passed`;
    } else if (m.daysToLaunch === 1) {
      timeline = `⚠️ Launch is tomorrow`;
    } else {
      timeline = `⏰ *${m.daysToLaunch}* days until launch`;
    }
  }

  // Gaps section — show up to 5 most severe gaps
  const severityOrder: Record<string, number> = { missing: 0, thin: 1, ungrounded: 2 };
  const sortedGaps = [...m.gaps].sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );
  const shownGaps = sortedGaps.slice(0, 5);

  const gapIcons: Record<string, string> = { missing: '✗', thin: '⚡', ungrounded: '❓' };

  let gapsText = shownGaps
    .map((g) => `${gapIcons[g.severity] || '•'} *${g.section}:* ${g.issue}`)
    .join('\n');

  const remainingGaps = m.gaps.length - 5;
  if (remainingGaps > 0) {
    gapsText += `\n...and ${remainingGaps} more`;
  }

  // Progress bar (emoji-based)
  const filledBlocks = Math.round(m.completenessScore * 10);
  const emptyBlocks = 10 - filledBlocks;
  const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

  // Nudge count note
  let nudgeNote = '';
  if (m.notificationCount > 1) {
    nudgeNote = `(this is nudge #${m.notificationCount})`;
  }

  // Blocks
  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${header}*\n${progressBar} ${m.completeSections}/${m.totalSections} sections\n${timeline}`,
      },
    },
  ];

  if (m.gaps.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Missing or incomplete sections:*\n${gapsText}`,
      },
    });
  }

  // Context footer
  const contextParts = [
    `*Epic:* <${epicUrl}|${m.epic_name}>`,
    `*Launch:* <${launchUrl}|${m.launch_name}>`,
  ];
  if (nudgeNote) contextParts.push(nudgeNote);

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: contextParts.join('  ·  ') }],
  });

  // Action buttons
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Open Story Brief' },
        url: epicUrl,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'MCP Setup Guide' },
        url: mcpSetupUrl,
      },
    ],
  });

  const textFallback = [
    header,
    `${progressBar} ${m.completeSections}/${m.totalSections} sections`,
    timeline,
    m.gaps.length > 0 ? `Gaps: ${m.gaps.map((g) => `${g.section}: ${g.issue}`).join('; ')}` : '',
    `Epic: ${epicUrl}  ·  Launch: ${launchUrl}`,
  ].filter(Boolean).join('\n');

  return { text: textFallback, blocks };
}