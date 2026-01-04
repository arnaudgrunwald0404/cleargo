/**
 * Scheduled job: Send escalation alerts for unreviewed epics and overdue retros
 * Runs daily to escalate epics that need attention
 * Part of Sprint 8: PM Monitoring Assignment + Reminders + Escalation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendSlackNotification, syncUserSlackHandle } from '@/lib/slack/notifications';
import { getEpicsNeedingEscalation } from '@/lib/services/successReviewService';

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

    console.log('Starting escalation alerts job...');
    const startTime = Date.now();

    const epicsNeedingEscalation = await getEpicsNeedingEscalation();
    const supabase = createClient();

    let alertsSent = 0;
    let alertsFailed = 0;
    const results: Array<{ epicId: string; escalationReason: string; success: boolean; error?: string }> = [];

    for (const epic of epicsNeedingEscalation) {
      if (!epic.postLaunchOwnerEmail) continue;

      try {
        // Sync Slack handle for the owner
        await syncUserSlackHandle(epic.postLaunchOwnerEmail);

        // Get user for notification
        const { data: user } = await supabase
          .from('app_user')
          .select('id, email, slack_handle')
          .eq('email', epic.postLaunchOwnerEmail)
          .single();

        const reasonText = epic.escalationReason === 'unreviewed'
          ? `No review for ${epic.daysSinceLastReview || 'unknown'} days`
          : `Retro T+${epic.overdueRetroDayMarker} is ${epic.overdueRetroDayMarker ? 'overdue' : 'due'}`;

        try {
          // Send Slack notification with high priority
          await sendSlackNotification({
            type: 'escalation_alert',
            priority: 'high',
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
              },
              escalationReason: epic.escalationReason,
              daysSinceLastReview: epic.daysSinceLastReview,
              overdueRetroDayMarker: epic.overdueRetroDayMarker,
            },
          });

          alertsSent++;
          results.push({
            epicId: epic.epicId,
            escalationReason: epic.escalationReason,
            success: true,
          });
        } catch (error: any) {
          alertsFailed++;
          results.push({
            epicId: epic.epicId,
            escalationReason: epic.escalationReason,
            success: false,
            error: error.message || 'Unknown error',
          });
        }
      } catch (error: any) {
        console.error(`Error sending escalation alert for epic ${epic.epicId}:`, error);
        alertsFailed++;
        results.push({
          epicId: epic.epicId,
          escalationReason: epic.escalationReason,
          success: false,
          error: error.message || 'Unknown error',
        });
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`Escalation alerts job completed in ${duration}ms: ${alertsSent} sent, ${alertsFailed} failed`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      alerts_sent: alertsSent,
      alerts_failed: alertsFailed,
      total_epics: epicsNeedingEscalation.length,
      results,
    });
  } catch (error: any) {
    console.error('Error in escalation alerts job:', error);
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

