/**
 * Scorecard calculation logic for success measurement
 * Calculates metric results and benchmark comparisons
 */
import { getEpicSuccessConfig, getEpicSuccessMetrics } from './successMeasurementService';
import { getMetricValue, getActivationData } from './metricValueService';
import { getEpic } from '@/lib/epics';
import type {
  MetricResult,
  BenchmarkComparison,
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
    const actual = await getMetricValue(metric, epicId, snapshotDate);

    // Determine expected value from thresholds
    const thresholds = epicMetric.threshold_override || metric.thresholds;
    const tierThresholds = thresholds[epic.tier as keyof MetricThresholds];
    let expected: number | null = null;

    if (tierThresholds?.target !== undefined) {
      expected = tierThresholds.target;
    } else if (tierThresholds?.min !== undefined && tierThresholds?.max !== undefined) {
      // Use midpoint of min/max as expected
      expected = (tierThresholds.min + tierThresholds.max) / 2;
    } else if (tierThresholds?.min !== undefined) {
      expected = tierThresholds.min;
    } else if (tierThresholds?.max !== undefined) {
      expected = tierThresholds.max;
    }

    // Determine status based on actual vs thresholds
    let status: ScorecardStatus = 'ON_TRACK';
    
    if (actual === null || actual === undefined) {
      // Missing data is risky
      status = 'AT_RISK';
    } else if (typeof actual === 'boolean') {
      // For boolean metrics, true = ON_TRACK, false = MISSED
      status = actual ? 'ON_TRACK' : 'MISSED';
    } else if (typeof actual === 'number' && tierThresholds) {
      // Compare actual vs thresholds
      if (tierThresholds.min !== undefined && actual < tierThresholds.min) {
        status = 'MISSED';
      } else if (tierThresholds.max !== undefined && actual > tierThresholds.max) {
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
 * Calculate benchmark comparison for a given epic and snapshot date
 * Returns null if no benchmark is configured (benchmarks are now selected as metrics)
 */
export async function calculateBenchmarkComparison(
  epicId: string,
  snapshotDate: string
): Promise<BenchmarkComparison | null> {
  const config = await getEpicSuccessConfig(epicId);
  const epic = await getEpic(epicId);

  // Benchmark is now optional - benchmarks are selected as metrics
  if (!config || !config.benchmark) {
    return null;
  }

  if (!epic || !epic.target_launch_date) {
    return null;
  }

  const benchmark = config.benchmark;
  const launchDate = new Date(epic.target_launch_date);
  const snapshot = new Date(snapshotDate);
  const daysSinceLaunch = Math.floor((snapshot.getTime() - launchDate.getTime()) / (1000 * 60 * 60 * 24));

  // Get expected activation for each horizon
  const horizons = benchmark.horizon_days;
  const expectedActivation = benchmark.expected_activation;

  // Fetch actual activation from data sources
  const actualActivation = await getActivationData(
    epicId,
    epic.target_launch_date,
    horizons
  );

  return {
    horizons,
    expectedActivation,
    actualActivation,
    dataMissing: actualActivation === null,
  };
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

