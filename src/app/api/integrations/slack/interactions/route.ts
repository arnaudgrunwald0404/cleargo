/**
 * Slack Interactions API endpoint
 * Handles button clicks, dropdown selections, and modal submissions
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest, extractSlackHeaders } from '@/lib/slack/verify';
import type { SlackInteractionPayload } from '@/types/slack';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';

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

    // Parse payload (Slack sends it as form-encoded)
    const formData = new URLSearchParams(body);
    const payloadStr = formData.get('payload');
    if (!payloadStr) {
      return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
    }

    const payload: SlackInteractionPayload = JSON.parse(payloadStr);

    // Route based on interaction type
    switch (payload.type) {
      case 'block_actions':
        return await handleBlockActions(payload);

      case 'view_submission':
        return await handleViewSubmission(payload);

      case 'view_closed':
        return await handleViewClosed(payload);

      default:
        console.log('Unhandled interaction type:', payload.type);
        return NextResponse.json({ ok: true });
    }
  } catch (error) {
    console.error('Slack interactions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleBlockActions(payload: SlackInteractionPayload) {
  const actions = payload.actions || [];

  for (const action of actions) {
    switch (action.action_id) {
      case 'update_criterion':
        // User clicked "Update Status" button
        // TODO: Open modal or redirect to launch detail
        console.log('Update criterion action:', action.value);
        break;

      case 'snooze_reminder':
        // User clicked "Snooze" button
        // TODO: Update notification schedule
        const data = JSON.parse(action.value || '{}');
        console.log('Snooze reminder:', data);
        break;

      default:
        console.log('Unhandled action:', action.action_id);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleViewSubmission(payload: SlackInteractionPayload) {
  // TODO: Handle modal form submissions
  console.log('View submission:', payload.view);
  return NextResponse.json({ ok: true });
}

async function handleViewClosed(payload: SlackInteractionPayload) {
  // TODO: Handle modal closures
  console.log('View closed');
  return NextResponse.json({ ok: true });
}
