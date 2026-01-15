/**
 * Scorecard calculation logic for success measurement
 * Calculates metric results and benchmark comparisons
 */
import { getEpicSuccessMetrics } from './successMeasurementService';
import { getMetricValue } from './metricValueService';
import { getEpic } from '@/lib/epics';
import type {
  MetricResult,
  ScorecardStatus,
  MetricThresholds,
} from '@/lib/success/types';

/**
 * Calculate metric results for a given epic and snapshot date
 * Fetches actual values from Pendo, Snowflake, or Manual sources
 */
export async function calculateMetricResults(
  epicId: string,
  snapshotDate: string
): Promise<MetricResult[]> {
  const metrics = await getEpicSuccessMetrics(epicId);
  const epic = await getEpic(epicId);
  
  if (!epic) {
    throw new Error('Epic not found');
  }

  const results: MetricResult[] = [];

  for (const epicMetric of metrics) {
    const metric = epicMetric.metric;
    if (!metric) continue;

    // Fetch actual value from appropriate source
    // Use epic-specific config if available
    const actual = await getMetricValue(
      metric, 
      epicId, 
      snapshotDate,
      {
        pendo_event_id: epicMetric.pendo_event_id,
        snowflake_query: epicMetric.snowflake_query,
        pendo_segment_ids: epicMetric.pendo_segment_ids ?? null,
        pendo_segment_names: epicMetric.pendo_segment_names ?? null,
        pendo_app_ids: epicMetric.pendo_app_ids ?? null,
        pendo_app_names: epicMetric.pendo_app_names ?? null,
      }
    );

    // Determine expected value - use epic-specific target first, then fall back to thresholds
    let expected: number | null = null;

    // Priority 1: Epic-specific target (required)
    if (epicMetric.target !== null && epicMetric.target !== undefined) {
      expected = epicMetric.target;
    } else {
      // Priority 2: Global thresholds (no longer tier-specific)
      const thresholds: MetricThresholds | null = epicMetric.threshold_override || metric.thresholds;
      
      if (thresholds?.target !== undefined) {
        expected = thresholds.target;
      } else if (thresholds?.min !== undefined && thresholds?.max !== undefined) {
        // Use midpoint of min/max as expected
        expected = (thresholds.min + thresholds.max) / 2;
      } else if (thresholds?.min !== undefined) {
        expected = thresholds.min;
      } else if (thresholds?.max !== undefined) {
        expected = thresholds.max;
      }
    }

    // Determine status based on actual vs thresholds
    let status: ScorecardStatus = 'ON_TRACK';
    
    if (actual === null || actual === undefined) {
      // Missing data is risky
      status = 'AT_RISK';
    } else if (typeof actual === 'boolean') {
      // For boolean metrics, true = ON_TRACK, false = MISSED
      status = actual ? 'ON_TRACK' : 'MISSED';
    } else if (typeof actual === 'number') {
      const thresholds: MetricThresholds | null = epicMetric.threshold_override || metric.thresholds;

      if (thresholds) {
        // Compare actual vs thresholds
        if (thresholds.min !== undefined && actual < thresholds.min) {
          status = 'MISSED';
        } else if (thresholds.max !== undefined && actual > thresholds.max) {
          // For some metrics, exceeding max might be good (e.g., adoption)
          // For others, it might be bad (e.g., error rate)
          // Default to ON_TRACK, but this could be configurable per metric
          status = 'ON_TRACK';
        } else if (expected !== null) {
          // Compare against target/expected
          const variance = Math.abs(actual - expected) / expected;
          if (variance > 0.2) {
            // More than 20% variance
            status = actual < expected ? 'MISSED' : 'ON_TRACK';
          } else if (variance > 0.05) {
            // 5-20% variance
            status = actual < expected ? 'AT_RISK' : 'ON_TRACK';
          }
        }
      } else if (expected !== null) {
        // Compare against target/expected
        const variance = Math.abs(actual - expected) / expected;
        if (variance > 0.2) {
          // More than 20% variance
          status = actual < expected ? 'MISSED' : 'ON_TRACK';
        } else if (variance > 0.05) {
          // 5-20% variance
          status = actual < expected ? 'AT_RISK' : 'ON_TRACK';
        }
      }
    }

    results.push({
      metricId: metric.id,
      metricName: metric.name,
      actual,
      expected,
      status,
      source: metric.source,
    });
  }

  return results;
}

/**
 * Determine overall scorecard status based on metric results
 */
export function determineOverallStatus(metricResults: MetricResult[]): ScorecardStatus {
  if (metricResults.length === 0) {
    return 'ON_TRACK'; // No metrics configured
  }

  // If any metric is MISSED, overall is MISSED
  if (metricResults.some(r => r.status === 'MISSED')) {
    return 'MISSED';
  }

  // If any metric is AT_RISK, overall is AT_RISK
  if (metricResults.some(r => r.status === 'AT_RISK')) {
    return 'AT_RISK';
  }

  // Otherwise, ON_TRACK
  return 'ON_TRACK';
}

