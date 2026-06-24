/**
 * Netlify Background Function: ClearGO Slack AI agent (runs up to 15 min).
 * Invoked by POST from the Slack events route after it has already acknowledged Slack with 200.
 * Runs the AI agent and posts the response back to Slack.
 */

import { runCleargoAgent, hasCleargoAgentKey } from '../../src/lib/ai/cleargoAgent';

const CRON_SECRET = process.env.CRON_SECRET || '';

interface AgentPayload {
  secret: string;
  type: 'app_mention' | 'direct_message';
  message: string;
  channel: string;
  thread_ts?: string;
  userEmail?: string;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: AgentPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!CRON_SECRET || payload.secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (!hasCleargoAgentKey()) {
    console.error('slack-agent-background: no AI API key configured');
    return new Response(JSON.stringify({ error: 'No AI key' }), { status: 500 });
  }

  try {
    const response = await runCleargoAgent({
      message: payload.message,
      userEmail: payload.userEmail,
    });

    // Post result to Slack
    const slackToken = process.env.SLACK_BOT_TOKEN;
    if (!slackToken) {
      console.error('slack-agent-background: SLACK_BOT_TOKEN not set');
      return new Response(JSON.stringify({ error: 'No Slack token' }), { status: 500 });
    }

    const body: Record<string, string> = {
      channel: payload.channel,
      text: response,
    };
    if (payload.thread_ts) {
      body.thread_ts = payload.thread_ts;
    }

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${slackToken}`,
      },
      body: JSON.stringify(body),
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('slack-agent-background error:', err?.message || err);
    return new Response(JSON.stringify({ error: 'Agent failed' }), { status: 500 });
  }
};
