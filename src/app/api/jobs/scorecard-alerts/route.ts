/**
 * Scheduled job: Send scorecard alert notifications
 * Runs after scorecard generation to alert on AT_RISK or MISSED status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendSlackNotification, syncUserSlackHandle } from '@/lib/slack/notifications';
import {
  getEpicsNeedingScorecardAlerts,
  getEpicOwners,
} from '@/lib/services/scorecardAlertService';
import { getEpic } from '@/lib/epics';
import { getEffectiveCohort1DateYmd } from '@/lib/epic-cohort1-date';
import type { Epic } from '@/types/epics';

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

    console.log('Starting scorecard alert job...');
    const startTime = Date.now();

    const alerts = await getEpicsNeedingScorecardAlerts();
    const supabase = createClient();

    let alertsSent = 0;
    let alertsFailed = 0;
    const results: Array<{ epicId: string; success: boolean; error?: string }> = [];

    for (const alert of alerts) {
      try {
        // Get epic details
        const epic = await getEpic(alert.epicId);
        if (!epic) {
          console.warn(`Epic ${alert.epicId} not found, skipping alert`);
          continue;
        }

        // Get owners
        const owners = await getEpicOwners(alert.epicId);
        const recipients = [
          owners.postLaunchOwnerEmail,
          owners.epicOwnerEmail,
        ].filter((email): email is string => !!email && email !== owners.postLaunchOwnerEmail);

        // Send to post-launch owner (primary)
        if (owners.postLaunchOwnerEmail) {
          await syncUserSlackHandle(owners.postLaunchOwnerEmail);

          const { data: postLaunchUser } = await supabase
            .from('app_user')
            .select('id, email, slack_handle')
            .eq('email', owners.postLaunchOwnerEmail)
            .single();

          try {
            await sendSlackNotification({
              type: 'scorecard_alert',
              priority: 'high',
              recipient: postLaunchUser ? {
                id: postLaunchUser.id,
                email: postLaunchUser.email,
                slack_handle: postLaunchUser.slack_handle || undefined,
                name: postLaunchUser.email,
              } : undefined,
              launch_id: alert.epicId,
              metadata: {
                epic: {
                  id: epic.id,
                  name: epic.name,
                  target_launch_date: epic.target_launch_date || '',
                  aha_fields: epic.aha_fields ?? null,
                  cohort1_display_date: getEffectiveCohort1DateYmd(epic as Pick<Epic, 'target_launch_date' | 'aha_fields'>) || '',
                },
                scorecard: alert.scorecard,
                alertType: alert.alertType,
              },
            });
            alertsSent++;
          } catch (error: any) {
            alertsFailed++;
          }
        }

        // Send to epic owner if different
        if (owners.epicOwnerEmail && owners.epicOwnerEmail !== owners.postLaunchOwnerEmail) {
          await syncUserSlackHandle(owners.epicOwnerEmail);

          const { data: epicOwnerUser } = await supabase
            .from('app_user')
            .select('id, email, slack_handle')
            .eq('email', owners.epicOwnerEmail)
            .single();

          try {
            await sendSlackNotification({
              type: 'scorecard_alert',
              priority: 'high',
              recipient: epicOwnerUser ? {
                id: epicOwnerUser.id,
                email: epicOwnerUser.email,
                slack_handle: epicOwnerUser.slack_handle || undefined,
                name: epicOwnerUser.email,
              } : undefined,
              launch_id: alert.epicId,
              metadata: {
                epic: {
                  id: epic.id,
                  name: epic.name,
                  target_launch_date: epic.target_launch_date || '',
                  aha_fields: epic.aha_fields ?? null,
                  cohort1_display_date: getEffectiveCohort1DateYmd(epic as Pick<Epic, 'target_launch_date' | 'aha_fields'>) || '',
                },
                scorecard: alert.scorecard,
                alertType: alert.alertType,
              },
            });
            alertsSent++;
          } catch (error: any) {
            alertsFailed++;
          }
        }

        results.push({
          epicId: alert.epicId,
          success: alertsSent > 0,
        });
      } catch (error: any) {
        console.error(`Error sending scorecard alert for epic ${alert.epicId}:`, error);
        alertsFailed++;
        results.push({
          epicId: alert.epicId,
          success: false,
          error: error.message || 'Unknown error',
        });
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`Scorecard alert job completed in ${duration}ms: ${alertsSent} sent, ${alertsFailed} failed`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      alerts_sent: alertsSent,
      alerts_failed: alertsFailed,
      total_alerts: alerts.length,
      results,
    });
  } catch (error: any) {
    console.error('Error in scorecard alert job:', error);
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

