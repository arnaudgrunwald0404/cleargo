/**
 * Scorecard Generation Service
 * Handles automated scorecard generation for epics
 */

import { getClient } from '@/lib/db';
import {
  calculateMetricResults,
  determineOverallStatus,
} from './scorecardCalculation';
import { createEpicScorecard, getEpicScorecardByDate } from './successMeasurementService';

export interface ScorecardGenerationResult {
  epicId: string;
  success: boolean;
  scorecardId?: string;
  error?: string;
}

/**
 * Generate scorecard for a single epic
 */
export async function generateScorecardForEpic(
  epicId: string,
  snapshotDate: string
): Promise<ScorecardGenerationResult> {
  try {
    // Check if scorecard already exists for this date
    const existing = await getEpicScorecardByDate(epicId, snapshotDate);
    if (existing) {
      return {
        epicId,
        success: true,
        scorecardId: existing.id,
      };
    }

    // Calculate metric results
    const metricResults = await calculateMetricResults(epicId, snapshotDate);
    const overallStatus = determineOverallStatus(metricResults);

    // Create scorecard
    const scorecard = await createEpicScorecard(
      epicId,
      snapshotDate,
      metricResults,
      overallStatus
    );

    return {
      epicId,
      success: true,
      scorecardId: scorecard.id,
    };
  } catch (error: any) {
    console.error(`Error generating scorecard for epic ${epicId}:`, error);
    return {
      epicId,
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Generate scorecards for all eligible epics on a given date
 */
export async function generateScorecardsForDate(
  snapshotDate: string
): Promise<ScorecardGenerationResult[]> {
  const supabase = getClient();
  
  // Query epics that are eligible for scorecard generation:
  // - Status is LAUNCHED or POST_LAUNCH
  // - target_launch_date is in the past
  // - Has epic_success_config configured
  const { data: epics, error } = await supabase
    .from('epic')
    .select('id, status, target_launch_date')
    .in('status', ['PLANNED', 'PRE_LAUNCH', 'LAUNCHING', 'LAUNCHED', 'POST_LAUNCH']);

  if (error) {
    console.error('Error fetching eligible epics:', error);
    throw new Error(`Failed to fetch eligible epics: ${error.message}`);
  }

  if (!epics || epics.length === 0) {
    return [];
  }

  // Filter to only epics that have success config
  const epicIds = epics.map(e => e.id);
  const { data: configs } = await supabase
    .from('epic_success_configs')
    .select('epic_id')
    .in('epic_id', epicIds);

  const configuredEpicIds = new Set((configs || []).map(c => c.epic_id));
  const eligibleEpics = epics.filter(e => configuredEpicIds.has(e.id));

  // Generate scorecards for each epic
  const results: ScorecardGenerationResult[] = [];
  for (const epic of eligibleEpics) {
    const result = await generateScorecardForEpic(epic.id, snapshotDate);
    results.push(result);
  }

  return results;
}

/**
 * Backfill scorecards for all epics currently in their active window (-90..+120), up to today.
 * For each epic, fill [launch-90, min(launch+120, today)].
 */
export async function backfillActiveScorecardsToToday(): Promise<Array<{ epicId: string; results: ScorecardGenerationResult[] }>> {
  const supabase = getClient();
  const todayStr = new Date().toISOString().split('T')[0];

  const { data: epics, error } = await supabase
    .from('epic')
    .select('id, status, target_launch_date')
    .in('status', ['PLANNED', 'PRE_LAUNCH', 'LAUNCHING', 'LAUNCHED', 'POST_LAUNCH']);

  if (error) {
    console.error('Error fetching epics for backfill:', error);
    throw new Error(`Failed to fetch epics: ${error.message}`);
  }

  if (!epics || epics.length === 0) return [];

  // Keep only epics within active window as of today
  const today = new Date(); today.setHours(0,0,0,0);
  const activeEpics = epics.filter((e) => {
    if (!e.target_launch_date) return false;
    const launch = new Date(e.target_launch_date as string);
    const days = Math.floor((today.getTime() - launch.getTime()) / 86400000);
    return days >= -90 && days <= 120;
  });

  if (activeEpics.length === 0) return [];

  // Ensure each epic has success config
  const epicIds = activeEpics.map(e => e.id);
  const { data: configs } = await supabase
    .from('epic_success_configs')
    .select('epic_id')
    .in('epic_id', epicIds);
  const configured = new Set((configs || []).map(c => c.epic_id));
  const eligible = activeEpics.filter(e => configured.has(e.id));

  const all: Array<{ epicId: string; results: ScorecardGenerationResult[] }> = [];

  for (const epic of eligible) {
    const launch = new Date(epic.target_launch_date as string);
    const start = new Date(launch); start.setDate(start.getDate() - 90); start.setHours(0,0,0,0);
    const endCap = new Date(launch); endCap.setDate(endCap.getDate() + 120); endCap.setHours(0,0,0,0);
    const end = new Date(Math.min(endCap.getTime(), today.getTime()));

    const res = await generateScorecardsForRange(
      epic.id,
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0]
    );

    all.push({ epicId: epic.id, results: res });
  }

  return all;
}

/**
 * Generate scorecards for today
 */
export async function generateScorecardsForToday(): Promise<ScorecardGenerationResult[]> {
  const today = new Date().toISOString().split('T')[0];
  return await generateScorecardsForDate(today);
}

/**
 * Generate scorecards for a continuous date range (inclusive)
 */
export async function generateScorecardsForRange(
  epicId: string,
  startDate: string,
  endDate: string
): Promise<ScorecardGenerationResult[]> {
  const results: ScorecardGenerationResult[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    // Re-use per-epic generation which is idempotent due to unique constraint check
    const r = await generateScorecardForEpic(epicId, dateStr);
    results.push(r);
  }
  return results;
}

/**
 * Generate scorecards for all epics that are within their active window (launch → +180d)
 * for a given snapshot date.
 */
export async function generateActiveScorecardsForDate(snapshotDate: string): Promise<ScorecardGenerationResult[]> {
  const supabase = getClient();
  const { data: epics, error } = await supabase
    .from('epic')
    .select('id, status, target_launch_date')
    .in('status', ['LAUNCHED', 'POST_LAUNCH'])
    .lte('target_launch_date', snapshotDate);

  if (error) {
    console.error('Error fetching epics for active window:', error);
    throw new Error(`Failed to fetch epics: ${error.message}`);
  }

  if (!epics || epics.length === 0) {
    return [];
  }

  // Filter to active window (-90 .. +120 days from launch)
  const activeEpics = epics.filter((e) => {
    if (!e.target_launch_date) return false;
    const launch = new Date(e.target_launch_date as string);
    const snap = new Date(snapshotDate);
    const days = Math.floor((snap.getTime() - launch.getTime()) / 86400000);
    return days >= -90 && days <= 120;
  });

  if (activeEpics.length === 0) return [];

  // Ensure epics have success config
  const epicIds = activeEpics.map(e => e.id);
  const { data: configs } = await supabase
    .from('epic_success_configs')
    .select('epic_id')
    .in('epic_id', epicIds);

  const configured = new Set((configs || []).map(c => c.epic_id));
  const eligible = activeEpics.filter(e => configured.has(e.id));

  const results: ScorecardGenerationResult[] = [];
  for (const epic of eligible) {
    const r = await generateScorecardForEpic(epic.id, snapshotDate);
    results.push(r);
  }
  return results;
}

// Note: benchmark-based scorecard generation has been removed.
