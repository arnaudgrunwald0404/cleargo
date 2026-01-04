/**
 * Scorecard Alert Service
 * Handles checking scorecards for alert conditions and sending alerts
 */

import { getClient } from '@/lib/db';
import { getEpicScorecardByDate, getEpicScorecards } from './successMeasurementService';
import type { EpicScorecard, ScorecardStatus } from '@/lib/success/types';

export interface ScorecardAlert {
  epicId: string;
  scorecard: EpicScorecard;
  alertType: 'AT_RISK' | 'MISSED';
  previousStatus?: ScorecardStatus;
}

/**
 * Check if a scorecard needs alerting
 */
export async function checkScorecardAlerts(
  epicId: string,
  scorecard: EpicScorecard
): Promise<ScorecardAlert | null> {
  // Check if overall status is AT_RISK or MISSED
  if (scorecard.overall_status === 'ON_TRACK') {
    return null; // No alert needed
  }

  // Check if this is a status change (compare with previous scorecard)
  const previousScorecards = await getEpicScorecards(epicId, 2);
  const previousScorecard = previousScorecards.find(
    sc => sc.snapshot_date < scorecard.snapshot_date
  );

  // If previous status was also AT_RISK or MISSED, only alert if it got worse
  if (previousScorecard) {
    if (
      previousScorecard.overall_status === 'MISSED' &&
      scorecard.overall_status === 'MISSED'
    ) {
      // Already MISSED, no need to alert again unless it's a new scorecard
      return null;
    }
    if (
      previousScorecard.overall_status === 'AT_RISK' &&
      scorecard.overall_status === 'AT_RISK'
    ) {
      // Still AT_RISK, check if any metrics got worse
      const previousMissedCount = previousScorecard.metric_results.filter(
        m => m.status === 'MISSED'
      ).length;
      const currentMissedCount = scorecard.metric_results.filter(
        m => m.status === 'MISSED'
      ).length;

      if (currentMissedCount <= previousMissedCount) {
        // Not getting worse, no alert
        return null;
      }
    }
  }

  return {
    epicId,
    scorecard,
    alertType: scorecard.overall_status as 'AT_RISK' | 'MISSED',
    previousStatus: previousScorecard?.overall_status,
  };
}

/**
 * Get epics with scorecards that need alerting
 */
export async function getEpicsNeedingScorecardAlerts(): Promise<ScorecardAlert[]> {
  const supabase = getClient();
  const today = new Date().toISOString().split('T')[0];

  // Get all scorecards from today
  const { data: scorecards, error } = await supabase
    .from('epic_scorecards')
    .select('*')
    .eq('snapshot_date', today);

  if (error) {
    console.error('Error fetching today\'s scorecards:', error);
    throw new Error(`Failed to fetch scorecards: ${error.message}`);
  }

  if (!scorecards || scorecards.length === 0) {
    return [];
  }

  const alerts: ScorecardAlert[] = [];

  for (const scorecard of scorecards) {
    const alert = await checkScorecardAlerts(scorecard.epic_id, scorecard as EpicScorecard);
    if (alert) {
      alerts.push(alert);
    }
  }

  return alerts;
}

/**
 * Get post-launch owner and epic owner for an epic
 */
export async function getEpicOwners(epicId: string): Promise<{
  postLaunchOwnerEmail?: string;
  epicOwnerEmail?: string;
}> {
  const supabase = getClient();

  const { data: epic, error: epicError } = await supabase
    .from('epic')
    .select('owner_email')
    .eq('id', epicId)
    .single();

  if (epicError) {
    console.error('Error fetching epic owners:', epicError);
    return {};
  }

  // Get success config separately
  const { data: config } = await supabase
    .from('epic_success_configs')
    .select(`
      post_launch_owner,
      post_launch_owner_user:app_user!post_launch_owner(email)
    `)
    .eq('epic_id', epicId)
    .single();

  const ownerUser = config?.post_launch_owner_user 
    ? (Array.isArray(config.post_launch_owner_user) 
        ? config.post_launch_owner_user[0] 
        : config.post_launch_owner_user)
    : null;

  return {
    postLaunchOwnerEmail: ownerUser?.email,
    epicOwnerEmail: epic?.owner_email || undefined,
  };
}

