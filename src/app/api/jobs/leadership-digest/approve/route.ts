/**
 * Approve and send the Weekly Release Readiness Digest.
 * GET ?token=... → send digest with narrative from token.
 * GET ?token=...&edit=1 → show edit form (narrative in textarea); POST to send with edited narrative.
 * POST body: token, narrative (optional; if present, used instead of token narrative).
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { createAdminClient } from '@/lib/supabase/server';
import { sendSlackNotification } from '@/lib/slack/notifications';
import { isChannelForbidden } from '@/lib/slack/client';
import {
    getLastNReleases,
    getNextNReleases,
    getLastReleaseAnalytics,
    getNextReleaseAnalytics,
} from '@/lib/services/releaseAnalyticsService';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SECRET = process.env.CRON_SECRET || process.env.SLACK_SIGNING_SECRET || 'digest-approve-fallback';

async function sendDigest(narrative: string | null, request: NextRequest): Promise<{ channel: string }> {
    const supabase = createAdminClient();
    const now = new Date();
    const weekOf = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const lastReleases = await getLastNReleases(2, supabase);
    const nextReleases = await getNextNReleases(2, supabase);
    const lastReleasesAnalytics = await Promise.all(
        lastReleases.map((r) => getLastReleaseAnalytics(r.release_name, r.launch_date, supabase))
    );
    const nextReleasesAnalytics = await Promise.all(
        nextReleases.map((r) => getNextReleaseAnalytics(r.release_name, r.launch_date, supabase))
    );

    const { data: settings } = await supabase
        .from('app_settings')
        .select('slack_channels, slack_default_channel')
        .single();
    const slackChannels = settings?.slack_channels || {};
    let channel =
        slackChannels.leadership_digest ||
        settings?.slack_default_channel ||
        process.env.SLACK_DEFAULT_CHANNEL;
    if (channel && isChannelForbidden(channel)) {
        channel = process.env.SLACK_DEFAULT_CHANNEL || undefined;
    }

    if (!channel) {
        throw new Error('No digest channel configured');
    }

    await sendSlackNotification({
        type: 'leadership_digest',
        priority: 'low',
        channel,
        metadata: {
            week_of: weekOf,
            narrative: narrative?.trim() || undefined,
            last_releases: lastReleasesAnalytics,
            next_releases: nextReleasesAnalytics,
        },
    });

    return { channel };
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');
        const edit = searchParams.get('edit') === '1';

        if (!token) {
            return NextResponse.json({ error: 'Missing token' }, { status: 400 });
        }

        const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
        const narrative = (payload.narrative as string) ?? '';
        if (payload.exp && payload.exp * 1000 < Date.now()) {
            return NextResponse.json({ error: 'Token expired' }, { status: 400 });
        }

        if (edit) {
            const action = new URL(request.url).pathname + new URL(request.url).search;
            const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Edit digest narrative</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    label { display: block; font-weight: 600; margin-bottom: 0.5rem; }
    textarea { width: 100%; min-height: 160px; padding: 0.5rem; box-sizing: border-box; }
    .actions { margin-top: 1rem; display: flex; gap: 0.5rem; }
    button[type="submit"] { padding: 0.5rem 1rem; background: #0d9488; color: white; border: none; border-radius: 6px; cursor: pointer; }
    button[type="submit"]:hover { background: #0f766e; }
    a.cancel { padding: 0.5rem 1rem; color: #475569; }
  </style>
</head>
<body>
  <h1>Edit narrative then send</h1>
  <p>Tweak the opening paragraph below, then click &ldquo;Send digest&rdquo; to post to the channel.</p>
  <form method="post" action="${action.replace(/&/g, '&amp;')}">
    <input type="hidden" name="token" value="${token.replace(/"/g, '&quot;')}" />
    <label for="narrative">Narrative</label>
    <textarea id="narrative" name="narrative" required>${narrative.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}</textarea>
    <div class="actions">
      <button type="submit">Send digest</button>
      <a href="#" class="cancel" onclick="window.close(); return false;">Cancel</a>
    </div>
  </form>
</body>
</html>`;
            return new NextResponse(html, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
        }

        const { channel } = await sendDigest(narrative, request);
        return new NextResponse(
            `Digest sent to ${channel}. You can close this tab.`,
            { headers: { 'Content-Type': 'text/plain' } }
        );
    } catch (err: any) {
        console.error('Digest approve error:', err);
        return NextResponse.json(
            { error: err?.message || 'Failed to send digest' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        let token: string;
        let narrative: string | null;

        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const body = await request.json();
            token = body.token;
            narrative = body.narrative ?? null;
        } else {
            const formData = await request.formData();
            token = (formData.get('token') as string) || '';
            narrative = (formData.get('narrative') as string) ?? null;
        }

        if (!token) {
            return NextResponse.json({ error: 'Missing token' }, { status: 400 });
        }

        await jwtVerify(token, new TextEncoder().encode(SECRET));
        if (!narrative || typeof narrative !== 'string') {
            return NextResponse.json({ error: 'Missing narrative' }, { status: 400 });
        }

        const { channel } = await sendDigest(narrative.trim(), request);

        const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Digest sent</title></head>
<body><p>Digest sent to ${channel}. You can close this tab.</p></body>
</html>`;
        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (err: any) {
        console.error('Digest approve POST error:', err);
        return NextResponse.json(
            { error: err?.message || 'Failed to send digest' },
            { status: 500 }
        );
    }
}
