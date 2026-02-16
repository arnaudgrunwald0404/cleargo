/**
 * Scheduled job: Send weekly reminders for unreviewed epic success scorecards
 * Runs weekly to remind PMs about epics that haven't been reviewed in 7+ days
 * Part of Sprint 8: PM Monitoring Assignment + Reminders + Escalation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendSlackNotification, syncUserSlackHandle } from '@/lib/slack/notifications';
import { getEpicsNeedingReview } from '@/lib/services/successReviewService';
import { getSettings } from '@/lib/settings-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 2 minutes for job execution

export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting weekly success review reminder job...');
    const startTime = Date.now();

    const epicsNeedingReview = await getEpicsNeedingReview();
    const supabase = createClient();

    let remindersSent = 0;
    let remindersFailed = 0;
    const results: Array<{ epicId: string; success: boolean; error?: string }> = [];

    // Helper function to add delay between notifications
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    let notificationCount = 0;
    for (const epic of epicsNeedingReview) {
      if (!epic.postLaunchOwnerEmail) continue;

      // Add delay between notifications to avoid rate limiting (500ms between each)
      if (notificationCount > 0) {
        await delay(500);
      }

      try {
        // Sync Slack handle for the owner
        await syncUserSlackHandle(epic.postLaunchOwnerEmail);

        // Get user for notification
        const { data: user } = await supabase
          .from('app_user')
          .select('id, email, slack_handle')
          .eq('email', epic.postLaunchOwnerEmail)
          .single();

        const daysText = epic.daysSinceLastReview === null
          ? 'never'
          : `${epic.daysSinceLastReview} days ago`;

        try {
          // Send Slack notification
          await sendSlackNotification({
            type: 'success_review_reminder',
            priority: 'medium',
            recipient: user ? {
              id: user.id,
              email: user.email,
              slack_handle: user.slack_handle || undefined,
              name: user.email,
            } : undefined,
            launch_id: epic.epicId,
            metadata: {
              epic: {
                id: epic.epicId,
                name: epic.epicName,
                target_launch_date: epic.launchDate || '',
              },
              daysSinceLastReview: epic.daysSinceLastReview,
              lastReviewDate: epic.lastReviewDate,
            },
          });

          remindersSent++;
          notificationCount++;
          results.push({
            epicId: epic.epicId,
            success: true,
          });
          console.log(`Sent success review reminder for epic ${epic.epicId} (${notificationCount} sent)`);
        } catch (error: any) {
          remindersFailed++;
          notificationCount++;
          results.push({
            epicId: epic.epicId,
            success: false,
            error: error.message || 'Unknown error',
          });
          console.error(`Failed to send review reminder for epic ${epic.epicId}:`, error);
        }
      } catch (error: any) {
        console.error(`Error sending review reminder for epic ${epic.epicId}:`, error);
        remindersFailed++;
        notificationCount++;
        results.push({
          epicId: epic.epicId,
          success: false,
          error: error.message || 'Unknown error',
        });
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`Weekly success review reminder job completed in ${duration}ms: ${remindersSent} sent, ${remindersFailed} failed`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      reminders_sent: remindersSent,
      reminders_failed: remindersFailed,
      total_epics: epicsNeedingReview.length,
      results,
    });
  } catch (error: any) {
    console.error('Error in weekly success review reminder job:', error);
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

