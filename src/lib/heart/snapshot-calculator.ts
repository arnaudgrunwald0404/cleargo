/**
 * HEART Snapshot Calculator
 * Fetches data from Pendo and calculates HEART metric values
 */

import { getClient } from '@/lib/db';
import { PendoClient } from '@/lib/integrations/pendo/client';
import type {
  EpicHeartMetric,
  EpicHeartSnapshot,
  HeartMetricStatus,
  HeartMeasurementType,
  HeartHappinessCompositeConfig,
} from './types';
import {
  DEFAULT_HAPPINESS_COMPOSITE_CONFIG,
  normalizeSurveyScore,
  calculateFrustrationHealth,
  calculateHappinessCompositeScore,
} from './happiness-composite';

// ============================================================================
// Pendo Client Helper
// ============================================================================

async function getPendoClient(): Promise<PendoClient | null> {
  const supabase = getClient();
  
  const { data: integration } = await supabase
    .from('pendo_integrations')
    .select('*')
    .eq('status', 'connected')
    .single();
  
  if (!integration) {
    console.warn('[SnapshotCalculator] No connected Pendo integration found');
    return null;
  }
  
  // TODO: Implement actual decryption
  const apiKey = integration.api_key_encrypted;
  
  return new PendoClient({
    apiKey,
    environment: integration.environment,
  });
}

// ============================================================================
// Snapshot Calculation
// ============================================================================

interface CalculationResult {
  value: number | null;
  rawData: Record<string, any>;
  error?: string;
}

async function getNormalizedSurveyScore(
  metricId: string,
  startDate: string,
  endDate: string
): Promise<{ score: number | null; responseCount: number; surveyType: string | null }> {
  const supabase = getClient();
  const { data: survey } = await supabase
    .from('heart_surveys')
    .select('id, survey_type')
    .eq('epic_heart_metric_id', metricId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!survey?.id) {
    return { score: null, responseCount: 0, surveyType: null };
  }

  const { data: responses } = await supabase
    .from('heart_survey_responses')
    .select('response_value')
    .eq('heart_survey_id', survey.id)
    .gte('responded_at', `${startDate}T00:00:00.000Z`)
    .lte('responded_at', `${endDate}T23:59:59.999Z`);

  const values = (responses || [])
    .map((r: any) => Number(r.response_value))
    .filter((n: number) => Number.isFinite(n));

  if (values.length === 0) {
    return { score: null, responseCount: 0, surveyType: survey.survey_type };
  }

  const avg = values.reduce((sum: number, n: number) => sum + n, 0) / values.length;
  return {
    score: normalizeSurveyScore(avg, survey.survey_type),
    responseCount: values.length,
    surveyType: survey.survey_type,
  };
}

async function getFrustrationHealthScore(
  client: PendoClient,
  config: HeartHappinessCompositeConfig,
  fallbackEventIds: string[],
  fallbackSegmentId: string | null | undefined,
  startDate: string,
  endDate: string
): Promise<{ health: number; penalty: number; totalEvents: number; uniqueUsers: number; per100Users: number }> {
  const eventIds = config.frustrationEventIds?.length > 0 ? config.frustrationEventIds : fallbackEventIds;
  const segmentId = config.frustrationSegmentId ?? fallbackSegmentId ?? null;

  if (!eventIds || eventIds.length === 0) {
    return { health: 100, penalty: 0, totalEvents: 0, uniqueUsers: 0, per100Users: 0 };
  }

  const pairs = await Promise.all(
    eventIds.map(async (eventId) => {
      const [eventCount, uniqueUsers] = await Promise.all([
        client.getEventCount({
          eventId,
          startDate,
          endDate,
          filters: segmentId ? { segmentId } : undefined,
        }),
        client.getUniqueVisitors({
          eventId,
          startDate,
          endDate,
          filters: segmentId ? { segmentId } : undefined,
        }),
      ]);
      return { eventCount, uniqueUsers };
    })
  );

  const totalEvents = pairs.reduce((sum, p) => sum + p.eventCount, 0);
  const uniqueUsers = Math.max(0, ...pairs.map((p) => p.uniqueUsers));
  const { penalty, health, eventsPer100Users } = calculateFrustrationHealth(
    totalEvents,
    uniqueUsers,
    config.frustrationEventsPer100UsersAtMaxPenalty
  );

  return { health, penalty, totalEvents, uniqueUsers, per100Users: eventsPer100Users };
}

/**
 * Calculate the value for a single HEART metric
 */
async function calculateMetricValue(
  metric: EpicHeartMetric,
  client: PendoClient,
  snapshotDate: Date,
  epicLaunchDate: Date | null
): Promise<CalculationResult> {
  const measurementType = metric.measurement_type as HeartMeasurementType;
  const eventIds = metric.pendo_event_ids;
  
  if (
    (!eventIds || eventIds.length === 0) &&
    measurementType !== 'happiness_composite_score' &&
    measurementType !== 'survey_score' &&
    measurementType !== 'nps_score' &&
    measurementType !== 'manual_numeric' &&
    measurementType !== 'manual_percentage'
  ) {
    return { value: null, rawData: {}, error: 'No event IDs configured' };
  }
  
  // Calculate date range based on measurement type
  const endDate = snapshotDate.toISOString().split('T')[0];
  let startDate: string;
  
  // For most metrics, look at last 7 days
  const rangeStart = new Date(snapshotDate);
  rangeStart.setDate(rangeStart.getDate() - 7);
  startDate = rangeStart.toISOString().split('T')[0];
  
  // For adoption metrics with a target timeframe, use launch date
  if (epicLaunchDate && measurementType.includes('unique_users')) {
    startDate = epicLaunchDate.toISOString().split('T')[0];
  }
  
  try {
    const primaryEventId = eventIds[0];
    const rawData: Record<string, any> = {
      eventId: primaryEventId,
      startDate,
      endDate,
      measurementType,
    };
    
    let value: number | null = null;
    
    switch (measurementType) {
      case 'manual_numeric':
      case 'manual_percentage':
        return { value: null, rawData: { source: 'manual', measurementType } };

      case 'events_per_user':
      case 'events_per_user_per_week': {
        // Get event count and divide by unique users
        const count = await client.getEventCount({
          eventId: primaryEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        // Get percentage to estimate user count (rough estimate)
        // In production, this would use actual user aggregation
        const percentage = await client.getEventPercentage({
          eventId: primaryEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        rawData.eventCount = count;
        rawData.percentage = percentage;
        
        // Estimate users based on percentage (very rough)
        // In production, you'd get actual unique user counts
        if (percentage > 0) {
          const estimatedUsers = count / (percentage / 100 * 10); // Rough estimate
          value = estimatedUsers > 0 ? count / estimatedUsers : 0;
          
          // If weekly, divide by weeks in range
          if (measurementType === 'events_per_user_per_week') {
            const days = (snapshotDate.getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
            const weeks = Math.max(1, days / 7);
            value = value / weeks;
          }
        }
        break;
      }
      
      case 'unique_users_percentage': {
        const percentage = await client.getEventPercentage({
          eventId: primaryEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        rawData.percentage = percentage;
        value = percentage;
        break;
      }
      
      case 'unique_users_count': {
        // Estimate from count and percentage
        const count = await client.getEventCount({
          eventId: primaryEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        rawData.eventCount = count;
        // This is a rough estimate - in production use actual aggregation
        value = count > 0 ? Math.min(count, count * 0.7) : 0; // Assume some repeat usage
        break;
      }
      
      case 'return_rate_7_days':
      case 'return_rate_14_days':
      case 'return_rate_30_days': {
        // Calculate retention by comparing two time periods
        const retentionDays = measurementType === 'return_rate_7_days' ? 7 :
                             measurementType === 'return_rate_14_days' ? 14 : 30;
        
        const periodStart = new Date(snapshotDate);
        periodStart.setDate(periodStart.getDate() - retentionDays * 2);
        
        const periodMid = new Date(snapshotDate);
        periodMid.setDate(periodMid.getDate() - retentionDays);
        
        // Get percentage in first period
        const firstPeriod = await client.getEventPercentage({
          eventId: primaryEventId,
          startDate: periodStart.toISOString().split('T')[0],
          endDate: periodMid.toISOString().split('T')[0],
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        // Get percentage in second period
        const secondPeriod = await client.getEventPercentage({
          eventId: primaryEventId,
          startDate: periodMid.toISOString().split('T')[0],
          endDate: endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        rawData.firstPeriodPercentage = firstPeriod;
        rawData.secondPeriodPercentage = secondPeriod;
        rawData.retentionDays = retentionDays;
        
        // Retention = second period / first period (capped at 100%)
        if (firstPeriod > 0) {
          value = Math.min(100, (secondPeriod / firstPeriod) * 100);
        } else {
          // No baseline activity — retention not computable yet; null → PENDING, not a misleading 0%
          value = null;
        }
        break;
      }
      
      case 'completion_rate':
      case 'success_rate': {
        // Use first event as "start" and second as "complete" if available
        const startEventId = eventIds[0];
        const completeEventId = eventIds[1] || eventIds[0];
        
        const startCount = await client.getEventCount({
          eventId: startEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        const completeCount = await client.getEventCount({
          eventId: completeEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        rawData.startEventId = startEventId;
        rawData.completeEventId = completeEventId;
        rawData.startCount = startCount;
        rawData.completeCount = completeCount;
        
        if (startCount > 0) {
          value = (completeCount / startCount) * 100;
        } else {
          value = 0;
        }
        break;
      }
      
      case 'survey_score':
      case 'nps_score': {
        // Survey data comes from a different source - skip for now
        return { value: null, rawData: {}, error: 'Survey metrics require survey responses' };
      }

      case 'happiness_composite_score': {
        const config: HeartHappinessCompositeConfig = {
          ...DEFAULT_HAPPINESS_COMPOSITE_CONFIG,
          ...(metric.composite_config?.happiness || {}),
        };

        const survey = await getNormalizedSurveyScore(metric.id, startDate, endDate);
        const frustration = await getFrustrationHealthScore(
          client,
          config,
          eventIds,
          metric.pendo_segment_id,
          startDate,
          endDate
        );

        const composite = calculateHappinessCompositeScore(survey.score, frustration.health, config);
        value = composite.score;

        rawData.surveyScoreNormalized = survey.score;
        rawData.surveyResponseCount = survey.responseCount;
        rawData.surveyType = survey.surveyType;
        rawData.surveyUsed = composite.surveyUsed;
        rawData.surveySource = composite.surveySource;
        rawData.frustrationPenaltyNormalized = frustration.penalty;
        rawData.frustrationHealth = frustration.health;
        rawData.frustrationEventsPer100Users = frustration.per100Users;
        rawData.frustrationTotalEvents = frustration.totalEvents;
        rawData.frustrationUniqueUsers = frustration.uniqueUsers;
        rawData.weights = {
          surveyWeight: config.surveyWeight,
          frustrationWeight: config.frustrationWeight,
        };
        break;
      }
      
      default:
        return { value: null, rawData: {}, error: `Unknown measurement type: ${measurementType}` };
    }
    
    return { value, rawData };
  } catch (error: any) {
    console.error(`[SnapshotCalculator] Error calculating metric ${metric.id}:`, error);
    return { value: null, rawData: {}, error: error.message };
  }
}

/**
 * Determine metric status based on value vs target
 */
function determineStatus(
  value: number | null,
  metric: EpicHeartMetric,
  daysSinceLaunch: number | null
): HeartMetricStatus {
  if (value === null) {
    return 'PENDING';
  }
  
  const target = metric.target_value;
  if (!target) {
    // No target set - always on track if we have data
    return 'ON_TRACK';
  }
  
  const targetDays = metric.target_timeframe_days;
  
  // If we have a timeframe target, calculate expected progress
  if (targetDays && daysSinceLaunch !== null && daysSinceLaunch > 0) {
    const progress = daysSinceLaunch / targetDays;
    const expectedValue = target * Math.min(1, progress);
    
    if (value >= expectedValue * 0.9) {
      return 'ON_TRACK';
    } else if (value >= expectedValue * 0.7) {
      return 'AT_RISK';
    } else {
      return daysSinceLaunch >= targetDays ? 'MISSED' : 'AT_RISK';
    }
  }
  
  // Simple comparison
  if (value >= target * 0.9) {
    return 'ON_TRACK';
  } else if (value >= target * 0.7) {
    return 'AT_RISK';
  } else {
    return 'MISSED';
  }
}

// ============================================================================
// Snapshot Creation
// ============================================================================

/**
 * Create snapshot for a single metric
 */
export async function createMetricSnapshot(
  metric: EpicHeartMetric,
  snapshotDate: Date = new Date()
): Promise<EpicHeartSnapshot | null> {
  const client = await getPendoClient();
  if (!client) {
    console.warn('[SnapshotCalculator] Cannot create snapshot - no Pendo client');
    return null;
  }
  
  const supabase = getClient();
  
  // Get epic launch date
  const { data: config } = await supabase
    .from('epic_heart_configs')
    .select('epic_id')
    .eq('id', metric.epic_heart_config_id)
    .single();
  
  let epicLaunchDate: Date | null = null;
  let daysSinceLaunch: number | null = null;
  
  if (config) {
    const { data: epic } = await supabase
      .from('epic')
      .select('target_launch_date')
      .eq('id', config.epic_id)
      .single();
    
    if (epic?.target_launch_date) {
      epicLaunchDate = new Date(epic.target_launch_date);
      daysSinceLaunch = Math.floor(
        (snapshotDate.getTime() - epicLaunchDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }
  }
  
  // Calculate the metric value
  const result = await calculateMetricValue(metric, client, snapshotDate, epicLaunchDate);
  
  // Determine status
  const status = determineStatus(result.value, metric, daysSinceLaunch);
  
  // Insert snapshot
  const snapshotDateStr = snapshotDate.toISOString().split('T')[0];
  
  const { data: snapshot, error } = await supabase
    .from('epic_heart_snapshots')
    .upsert({
      epic_heart_metric_id: metric.id,
      snapshot_date: snapshotDateStr,
      value: result.value,
      target_at_snapshot: metric.target_value,
      status,
      pendo_raw_data: result.rawData,
      calculated_at: new Date().toISOString(),
    }, {
      onConflict: 'epic_heart_metric_id,snapshot_date',
    })
    .select()
    .single();
  
  if (error) {
    console.error('[SnapshotCalculator] Error saving snapshot:', error);
    return null;
  }
  
  return snapshot;
}

/**
 * Create snapshots for all metrics of an epic
 */
export async function createEpicSnapshots(
  epicId: string,
  snapshotDate: Date = new Date()
): Promise<EpicHeartSnapshot[]> {
  const supabase = getClient();
  
  // Get the HEART config
  const { data: config } = await supabase
    .from('epic_heart_configs')
    .select('id')
    .eq('epic_id', epicId)
    .eq('status', 'active')
    .single();
  
  if (!config) {
    console.warn(`[SnapshotCalculator] No active HEART config for epic ${epicId}`);
    return [];
  }
  
  // Get all active metrics
  const { data: metrics } = await supabase
    .from('epic_heart_metrics')
    .select('*')
    .eq('epic_heart_config_id', config.id)
    .eq('is_active', true);
  
  if (!metrics || metrics.length === 0) {
    return [];
  }
  
  // Create snapshots for each metric
  const snapshots: EpicHeartSnapshot[] = [];
  
  for (const metric of metrics) {
    const snapshot = await createMetricSnapshot(metric, snapshotDate);
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }
  
  console.log(`[SnapshotCalculator] Created ${snapshots.length} snapshots for epic ${epicId}`);
  return snapshots;
}

/**
 * Create snapshots for all epics with active HEART configs
 * This would be called by a cron job daily
 */
export async function createAllSnapshots(
  snapshotDate: Date = new Date()
): Promise<{ epicId: string; snapshotCount: number }[]> {
  const supabase = getClient();
  
  // Get all active configs
  const { data: configs } = await supabase
    .from('epic_heart_configs')
    .select('epic_id')
    .eq('status', 'active');
  
  if (!configs || configs.length === 0) {
    console.log('[SnapshotCalculator] No active HEART configs found');
    return [];
  }
  
  const results: { epicId: string; snapshotCount: number }[] = [];
  
  for (const config of configs) {
    const snapshots = await createEpicSnapshots(config.epic_id, snapshotDate);
    results.push({
      epicId: config.epic_id,
      snapshotCount: snapshots.length,
    });
  }
  
  console.log(`[SnapshotCalculator] Created snapshots for ${results.length} epics`);
  return results;
}
