/**
 * Slack slash command: /epic-status
 * Get the current status of a specific epic
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest, extractSlackHeaders } from '@/lib/slack/verify';
import type { SlackCommandPayload, SlackBlock } from '@/types/slack';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.clearcompany.com';

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const { timestamp, signature } = extractSlackHeaders(request);

    // Verify request is from Slack
    if (!timestamp || !signature) {
      return NextResponse.json({ error: 'Missing Slack headers' }, { status: 400 });
    }

    if (!verifySlackRequest(body, timestamp, signature, SLACK_SIGNING_SECRET)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse form data
    const formData = new URLSearchParams(body);
    const payload: SlackCommandPayload = {
      token: formData.get('token') || '',
      team_id: formData.get('team_id') || '',
      team_domain: formData.get('team_domain') || '',
      channel_id: formData.get('channel_id') || '',
      channel_name: formData.get('channel_name') || '',
      user_id: formData.get('user_id') || '',
      user_name: formData.get('user_name') || '',
      command: formData.get('command') || '',
      text: formData.get('text') || '',
      api_app_id: formData.get('api_app_id') || '',
      response_url: formData.get('response_url') || '',
      trigger_id: formData.get('trigger_id') || '',
    };

    const searchTerm = payload.text.trim();

    if (!searchTerm) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'Please provide an epic name or Aha ID. Example: `/epic-status HIRE-123`',
      });
    }

    // Query epic by name or Aha ID
    const supabase = (await import('@/lib/supabase/server')).createClient();

    const { data: epics, error: epicError } = await supabase
      .from('epic')
      .select(
        'id, name, aha_reference_num, tier, readiness_status, readiness_score, risk_level, target_launch_date'
      )
      .or(`name.ilike.%${searchTerm}%,aha_reference_num.ilike.%${searchTerm}%`)
      .limit(5);

    if (epicError) {
      console.error('Error fetching epic:', epicError);
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `❌ Error searching for epic: ${epicError.message}`,
      });
    }

    if (!epics || epics.length === 0) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `🔍 No epics found matching "${searchTerm}"`,
      });
    }

    // If multiple matches, show list
    if (epics.length > 1) {
      const blocks: SlackBlock[] = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Found ${epics.length} epics matching "${searchTerm}":`,
          },
        },
        { type: 'divider' },
      ];

      for (const epic of epics) {
        const statusEmoji =
          epic.readiness_status === 'GO'
            ? '✅'
            : epic.readiness_status === 'CONDITIONAL_GO'
              ? '⚠️'
              : '❌';

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${statusEmoji} *${epic.name}*\nAha ID: ${epic.aha_reference_num || 'N/A'} | Tier: ${epic.tier}`,
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
      }

      return NextResponse.json({
        response_type: 'ephemeral',
        blocks,
      });
    }

    // Single match - show detailed status
    const epic = epics[0];

    // Get gate criteria summary
    const { data: gateStatuses } = await supabase
      .from('epic_criterion_status')
      .select(
        `
                status,
                criterion:criterion_id (
                    gate
                )
            `
      )
      .eq('epic_id', epic.id);

    const gates = (gateStatuses || []).filter((s: any) => {
      const criterion = Array.isArray(s.criterion) ? s.criterion[0] : s.criterion;
      return criterion?.gate === true;
    });

    const gateGo = gates.filter((g: any) => g.status === 'GO').length;
    const gateTotal = gates.length;

    const statusEmoji =
      epic.readiness_status === 'GO'
        ? '✅'
        : epic.readiness_status === 'CONDITIONAL_GO'
          ? '⚠️'
          : '❌';
    const riskEmoji =
      epic.risk_level === 'HIGH' ? '🔴' : epic.risk_level === 'MEDIUM' ? '🟡' : '🟢';
    const score = epic.readiness_score ? Math.round(epic.readiness_score * 100) : 0;

    const targetDate = epic.target_launch_date
      ? new Date(epic.target_launch_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'Not set';

    const daysToLaunch = epic.target_launch_date
      ? Math.ceil(
          (new Date(epic.target_launch_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      : null;

    const daysText =
      daysToLaunch !== null
        ? daysToLaunch > 0
          ? `(${daysToLaunch} days away)`
          : `(${Math.abs(daysToLaunch)} days overdue)`
        : '';

    return NextResponse.json({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: epic.name,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Aha ID:*\n${epic.aha_reference_num || 'N/A'}`,
            },
            {
              type: 'mrkdwn',
              text: `*Tier:*\n${epic.tier}`,
            },
            {
              type: 'mrkdwn',
              text: `*Status:*\n${statusEmoji} ${epic.readiness_status}`,
            },
            {
              type: 'mrkdwn',
              text: `*Risk:*\n${riskEmoji} ${epic.risk_level}`,
            },
            {
              type: 'mrkdwn',
              text: `*Readiness Score:*\n${score}%`,
            },
            {
              type: 'mrkdwn',
              text: `*Target Date:*\n${targetDate} ${daysText}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Gate Criteria:* ${gateGo}/${gateTotal} GO`,
          },
        },
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
              url: `${APP_URL}/epics/${epic.id}`,
              style: 'primary',
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.error('Slack command error:', error);
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'Sorry, an error occurred while processing your request.',
    });
  }
}
