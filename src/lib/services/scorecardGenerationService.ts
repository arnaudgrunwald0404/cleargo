/**
 * Scorecard Generation Service
 * Handles automated scorecard generation for epics
 */

import { getClient } from '@/lib/db';
import {
  calculateMetricResults,
  calculateBenchmarkComparison,
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

    // Calculate metric results and benchmark comparison
    const metricResults = await calculateMetricResults(epicId, snapshotDate);
    const benchmarkComparison = await calculateBenchmarkComparison(epicId, snapshotDate);
    const overallStatus = determineOverallStatus(metricResults);

    // Create scorecard
    const scorecard = await createEpicScorecard(
      epicId,
      snapshotDate,
      metricResults,
      benchmarkComparison,
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
    .in('status', ['LAUNCHED', 'POST_LAUNCH'])
    .lte('target_launch_date', snapshotDate);

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
 * Generate scorecards for today
 */
export async function generateScorecardsForToday(): Promise<ScorecardGenerationResult[]> {
  const today = new Date().toISOString().split('T')[0];
  return await generateScorecardsForDate(today);
}

