/**
 * Scheduled job: Send retro reminder notifications
 * Runs daily to remind post-launch owners about due retrospectives
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendSlackNotification, syncUserSlackHandle } from '@/lib/slack/notifications';
import { getEpicsWithDueRetros } from '@/lib/services/retroReminderService';
import { buildRetroReminderMessage } from '@/lib/slack/templates/retro-reminders';
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

    const settings = await getSettings();
    const reminderDaysBefore = 3; // Default: 3 days before due date

    console.log('Starting retro reminder job...');
    const startTime = Date.now();

    const epicsWithDueRetros = await getEpicsWithDueRetros(reminderDaysBefore);
    const supabase = createClient();

    let remindersSent = 0;
    let remindersFailed = 0;
    const results: Array<{ epicId: string; dayMarker: number; success: boolean; error?: string }> = [];

    for (const epic of epicsWithDueRetros) {
      for (const dayMarker of epic.dueRetros) {
        try {
          // Sync Slack handle for the owner
          await syncUserSlackHandle(epic.postLaunchOwnerEmail);

          // Build message
          const message = buildRetroReminderMessage(
            {
              id: epic.epicId,
              name: epic.epicName,
              target_launch_date: epic.launchDate,
            },
            dayMarker,
            epic.daysSinceLaunch
          );

          // Get user for notification
          const { data: user } = await supabase
            .from('app_user')
            .select('id, email, slack_handle')
            .eq('email', epic.postLaunchOwnerEmail)
            .single();

          try {
            // Send Slack notification
            await sendSlackNotification({
              type: 'retro_reminder',
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
                  target_launch_date: epic.launchDate,
                },
                dayMarker,
                daysSinceLaunch: epic.daysSinceLaunch,
              },
            });

            remindersSent++;
            results.push({
              epicId: epic.epicId,
              dayMarker,
              success: true,
            });
          } catch (error: any) {
            remindersFailed++;
            results.push({
              epicId: epic.epicId,
              dayMarker,
              success: false,
              error: error.message || 'Unknown error',
            });
          }

        } catch (error: any) {
          console.error(`Error sending retro reminder for epic ${epic.epicId}, T+${dayMarker}:`, error);
          remindersFailed++;
          results.push({
            epicId: epic.epicId,
            dayMarker,
            success: false,
            error: error.message || 'Unknown error',
          });
        }
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`Retro reminder job completed in ${duration}ms: ${remindersSent} sent, ${remindersFailed} failed`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      reminders_sent: remindersSent,
      reminders_failed: remindersFailed,
      total_epics: epicsWithDueRetros.length,
      results,
    });
  } catch (error: any) {
    console.error('Error in retro reminder job:', error);
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

