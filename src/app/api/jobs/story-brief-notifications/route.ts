/**
 * Scheduled job: Send Story Brief completeness nudges
 *
 * Runs daily to assess epics in active launches, determine which PMs need
 * nudges based on cadence (scales with days-to-launch), and send Slack DMs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendSlackNotification, syncUserSlackHandle } from '@/lib/slack/notifications';
import { planStoryBriefNotifications } from '@/lib/services/storyBriefNotificationService';
import { getSettings } from '@/lib/settings-db';
import { getNotificationCalendarSkip } from '@/lib/services/notificationCalendarService';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    // Verify cron auth
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Skip on weekends / holidays
    const calendarSkip = await getNotificationCalendarSkip(request, { client: adminClient });
    if (calendarSkip) return NextResponse.json(calendarSkip);

    const settings = await getSettings(adminClient);
    const searchParams = request.nextUrl.searchParams;
    const dryRun = searchParams.get('dry_run') === 'true';
    const testEmail = searchParams.get('test_email');

    console.log('Starting Story Brief notification job...', { dryRun, testEmail });
    const startTime = Date.now();

    // Plan notifications
    const { notifications, assessments } = await planStoryBriefNotifications();

    let sent = 0;
    let failed = 0;
    const results: Array<{
      epicId: string;
      epicName: string;
      pmEmail: string;
      success: boolean;
      error?: string;
    }> = [];

    // Helper delay to avoid rate limiting
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (const notification of notifications) {
      const { epicId, epicName, pmEmail, message } = notification;

      // Respect dry_run / test_email
      if (dryRun) {
        console.log(`[DRY-RUN] Would send Story Brief nudge to ${pmEmail} for ${epicName}`);
        sent++;
        results.push({ epicId, epicName, pmEmail, success: true });
        continue;
      }

      if (testEmail && pmEmail !== testEmail) {
        console.log(`[TEST] Skipping ${pmEmail} (test_email=${testEmail})`);
        continue;
      }

      try {
        // Sync Slack handle
        await syncUserSlackHandle(pmEmail);

        // Fetch user record
        const { data: user } = await adminClient
          .from('app_user')
          .select('id, email, slack_handle')
          .eq('email', pmEmail)
          .single();

        await sendSlackNotification({
          type: 'story_brief_review',
          priority: 'medium',
          recipient: user
            ? {
                id: user.id,
                email: user.email,
                slack_handle: user.slack_handle || undefined,
                name: user.email,
              }
            : undefined,
          gtm_launch_id: message.launch_id,
          launch_id: epicId,
          metadata: message,
        });

        sent++;
        results.push({ epicId, epicName, pmEmail, success: true });
        console.log(`Sent Story Brief nudge to ${pmEmail} for ${epicName}`);
      } catch (error: any) {
        failed++;
        results.push({
          epicId,
          epicName,
          pmEmail,
          success: false,
          error: error.message || 'Unknown error',
        });
        console.error(`Failed to send Story Brief nudge to ${pmEmail}:`, error);
      }

      // Throttle between notifications
      await delay(500);
    }

    const duration = Date.now() - startTime;
    console.log(
      `Story Brief notification job completed in ${duration}ms: ` +
      `${sent} sent, ${failed} failed, ${assessments.length} assessed`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      notifications_sent: sent,
      notifications_failed: failed,
      total_assessed: assessments.length,
      assessments,
      results,
    });
  } catch (error: any) {
    console.error('Error in Story Brief notification job:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}