/**
 * Slack Events API endpoint
 * Handles incoming events from Slack (app mentions, home opened, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest, extractSlackHeaders } from '@/lib/slack/verify';
import type { SlackEventPayload } from '@/types/slack';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const payload: SlackEventPayload = JSON.parse(body);

    // Handle URL verification challenge FIRST (before signature check)
    // Slack's challenge request may not include proper signing headers
    if (payload.type === 'url_verification') {
      return NextResponse.json({ challenge: payload.challenge });
    }

    // Now verify request is from Slack for all other events
    const { timestamp, signature } = extractSlackHeaders(request);

    if (!timestamp || !signature) {
      return NextResponse.json({ error: 'Missing Slack headers' }, { status: 400 });
    }

    if (!SLACK_SIGNING_SECRET) {
      console.error('SLACK_SIGNING_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!verifySlackRequest(body, timestamp, signature, SLACK_SIGNING_SECRET)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Handle events
    if (payload.type === 'event_callback') {
      const { event } = payload;

      switch (event.type) {
        case 'app_home_opened':
          await handleAppHomeOpened(event);
          break;

        case 'app_mention':
          await handleAppMention(event);
          break;

        case 'message':
          if (event.channel_type === 'im') {
            await handleDirectMessage(event);
          }
          break;

        case 'link_shared':
          await handleLinkShared(event);
          break;

        default:
          console.log('Unhandled event type:', event.type);
      }
    }

    // Acknowledge receipt
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Slack events error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleAppHomeOpened(event: any) {
  // TODO: Publish personalized home view with user's launches and criteria
  console.log('App home opened by user:', event.user);
}

async function handleAppMention(event: any) {
  // TODO: Respond to @mentions with helpful information
  console.log('App mentioned:', event.text);
}

async function handleDirectMessage(event: any) {
  // TODO: Handle DMs to the bot
  console.log('Direct message received:', event.text);
}

async function handleLinkShared(event: any) {
  // TODO: Unfurl launch console URLs
  console.log('Link shared:', event.links);
}
