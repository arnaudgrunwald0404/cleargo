/**
 * Weekly batched Slack reminders for unconfirmed GTM org access.
 * One digest per PM per week; stops when confirmed or after lifetime cap.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { logNotification, sendSlackNotification, syncUserSlackHandle } from '@/lib/slack/notifications';
import { getSettings } from '@/lib/settings-db';
import {
  countGtmNudgesForEpic,
  getGtmAccessPendingByOwner,
  GTM_ACCESS_MAX_LIFETIME_NUDGES,
  GTM_ACCESS_NUDGE_TYPE,
  wasGtmNudgeSentRecently,
  type GtmAccessPendingEpic,
} from '@/lib/services/gtmAccessNudgeService';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const testEmail = request.nextUrl.searchParams.get('test_email')?.trim().toLowerCase();
    const settings = await getSettings();
    if (settings.slack_gtm_access_nudge === false) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'slack_gtm_access_nudge disabled in settings',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('Starting GTM access nudge job...');
    const startTime = Date.now();
    const supabase = createAdminClient();

    let byOwner = await getGtmAccessPendingByOwner();
    if (testEmail) {
      const filtered = new Map<string, GtmAccessPendingEpic[]>();
      const items = byOwner.get(testEmail);
      if (items?.length) filtered.set(testEmail, items);
      byOwner = filtered;
    }

    let digestsSent = 0;
    let digestsSkipped = 0;
    let digestsFailed = 0;
    const results: Array<{ ownerEmail: string; success: boolean; epicCount?: number; error?: string; reason?: string }> = [];

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let notificationCount = 0;

    for (const [ownerEmail, epics] of byOwner.entries()) {
      const eligible: GtmAccessPendingEpic[] = [];
      for (const epic of epics) {
        const lifetime = await countGtmNudgesForEpic(epic.epicId);
        if (lifetime >= GTM_ACCESS_MAX_LIFETIME_NUDGES) continue;
        eligible.push(epic);
      }

      if (eligible.length === 0) {
        digestsSkipped++;
        results.push({ ownerEmail, success: true, reason: 'no_eligible_epics' });
        continue;
      }

      if (await wasGtmNudgeSentRecently(ownerEmail)) {
        digestsSkipped++;
        results.push({ ownerEmail, success: true, reason: 'recent_digest' });
        continue;
      }

      if (notificationCount > 0) await delay(500);

      try {
        await syncUserSlackHandle(ownerEmail);

        const { data: user } = await supabase
          .from('app_user')
          .select('id, email, slack_handle, first_name, last_name')
          .ilike('email', ownerEmail)
          .maybeSingle();

        const displayName =
          [user?.first_name, user?.last_name].filter(Boolean).join(' ') || ownerEmail;

        const recipient = user
          ? {
              id: user.id,
              email: user.email,
              slack_handle: user.slack_handle || undefined,
              name: displayName,
            }
          : {
              id: ownerEmail,
              email: ownerEmail,
              name: displayName,
            };

        await sendSlackNotification({
          type: GTM_ACCESS_NUDGE_TYPE,
          priority: 'medium',
          recipient,
          launch_id: eligible[0].epicId,
          metadata: {
            owner_email: ownerEmail,
            epics: eligible,
            epic_count: eligible.length,
          },
        });

        // Log remaining epics so per-epic lifetime caps work (first epic logged by sendSlackNotification).
        for (const epic of eligible.slice(1)) {
          await logNotification({
            user_id: recipient.id,
            launch_id: epic.epicId,
            type: GTM_ACCESS_NUDGE_TYPE,
            payload: { owner_email: ownerEmail, digest: true, epic_id: epic.epicId },
            delivery_channel: 'slack',
            status: 'sent',
          });
        }

        digestsSent++;
        notificationCount++;
        results.push({ ownerEmail, success: true, epicCount: eligible.length });
        console.log(`Sent GTM access digest to ${ownerEmail} (${eligible.length} epics)`);
      } catch (error: unknown) {
        digestsFailed++;
        notificationCount++;
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({ ownerEmail, success: false, error: message });
        console.error(`Failed GTM access digest for ${ownerEmail}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `GTM access nudge job done in ${duration}ms: ${digestsSent} sent, ${digestsSkipped} skipped, ${digestsFailed} failed`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      digests_sent: digestsSent,
      digests_skipped: digestsSkipped,
      digests_failed: digestsFailed,
      owners_total: byOwner.size,
      results,
    });
  } catch (error: unknown) {
    console.error('GTM access nudge job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
