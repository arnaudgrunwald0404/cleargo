/**
 * Unified Metric Value Service
 * Provides a single interface to fetch metric values from any source
 */

import { fetchMetricValue as fetchPendoValue, fetchActivationData as fetchPendoActivation, type PendoMetricOptions } from '@/lib/integrations/pendo/service';
import { fetchMetricValue as fetchSnowflakeValue } from '@/lib/integrations/snowflake/service';
import { getClient } from '@/lib/db';
import type { SuccessMetric } from '@/lib/success/types';

/**
 * Get metric value from any source (Pendo, Snowflake, or Manual)
 * Manual values take precedence if they exist
 * 
 * @param metric - The success metric definition
 * @param epicId - The epic ID
 * @param snapshotDate - The snapshot date
 * @param epicMetricConfig - Optional epic-specific configuration (pendo_event_id, snowflake_query, etc.)
 */
export async function getMetricValue(
  metric: SuccessMetric,
  epicId: string,
  snapshotDate: string,
  epicMetricConfig?: {
    pendo_event_id?: string | null;
    snowflake_query?: string | null;
    pendo_segment_ids?: string[] | null;
    pendo_segment_names?: string[] | null;
    pendo_app_ids?: string[] | null;
    pendo_app_names?: string[] | null;
  }
): Promise<number | boolean | null> {
  // First, check for manual value (takes precedence)
  const manualValue = await getManualMetricValue(epicId, metric.id, snapshotDate);
  if (manualValue !== null && manualValue !== undefined) {
    return manualValue;
  }

  // Then fetch from automated source
  // Use epic-specific config if provided, otherwise fall back to metric defaults
  switch (metric.source) {
    case 'PENDO': {
      // Use epic-specific pendo_event_id if provided, otherwise use metric default
      const pendoEventId = epicMetricConfig?.pendo_event_id || metric.pendo_event_id;
      if (!pendoEventId) {
        console.warn(`No Pendo event ID configured for metric ${metric.id} in epic ${epicId}`);
        return null;
      }
      // Create a modified metric object with epic-specific event ID
      const epicMetric = { ...metric, pendo_event_id: pendoEventId };
      const pendoOptions: PendoMetricOptions = {
        pendoSegmentIds: epicMetricConfig?.pendo_segment_ids ?? undefined,
        pendoSegmentNames: epicMetricConfig?.pendo_segment_names ?? undefined,
        pendoAppIds: epicMetricConfig?.pendo_app_ids ?? undefined,
        pendoAppNames: epicMetricConfig?.pendo_app_names ?? undefined,
      };
      return await fetchPendoValue(epicMetric, epicId, snapshotDate, pendoOptions);
    }
    case 'SNOWFLAKE': {
      // Use epic-specific snowflake_query if provided
      // Note: SuccessMetric doesn't have snowflake_query at metric level, only at epic level
      const snowflakeQuery = epicMetricConfig?.snowflake_query;
      if (!snowflakeQuery) {
        console.warn(`No Snowflake query configured for metric ${metric.id} in epic ${epicId}`);
        return null;
      }
      // Pass query as parameter to fetchSnowflakeValue
      return await fetchSnowflakeValue(metric, epicId, snapshotDate, snowflakeQuery);
    }
    case 'MANUAL':
      // For manual-only metrics, return null if no manual value exists
      return null;
    default:
      console.warn(`Unknown metric source: ${metric.source}`);
      return null;
  }
}

/**
 * Get activation data for benchmark comparison
 */
export async function getActivationData(
  epicId: string,
  launchDate: string,
  horizons: number[]
): Promise<number[] | null> {
  // For now, only Pendo provides activation data
  // In the future, this could support other sources
  return await fetchPendoActivation(epicId, launchDate, horizons);
}

/**
 * Get manual metric value from database
 */
async function getManualMetricValue(
  epicId: string,
  metricId: string,
  snapshotDate: string
): Promise<number | boolean | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('manual_metric_values')
    .select('value')
    .eq('epic_id', epicId)
    .eq('metric_id', metricId)
    .eq('snapshot_date', snapshotDate)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // No manual value found
    }
    console.error('Error fetching manual metric value:', error);
    return null;
  }

  // Parse JSON value
  if (data && data.value !== null && data.value !== undefined) {
    return data.value as number | boolean;
  }

  return null;
}

/**
 * Store manual metric value
 */
export async function storeManualMetricValue(
  epicId: string,
  metricId: string,
  snapshotDate: string,
  value: number | boolean,
  userId: string
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('manual_metric_values')
    .upsert({
      epic_id: epicId,
      metric_id: metricId,
      snapshot_date: snapshotDate,
      value: value,
      entered_by: userId,
      entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'epic_id,metric_id,snapshot_date',
    });

  if (error) {
    console.error('Error storing manual metric value:', error);
    throw new Error(`Failed to store manual metric value: ${error.message}`);
  }
}

/**
 * Get manual metric values for a date range
 */
export async function getManualMetricValues(
  epicId: string,
  metricId: string,
  startDate: string,
  endDate: string
): Promise<Array<{ snapshot_date: string; value: number | boolean; entered_by: string; entered_at: string }>> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('manual_metric_values')
    .select('snapshot_date, value, entered_by, entered_at')
    .eq('epic_id', epicId)
    .eq('metric_id', metricId)
    .gte('snapshot_date', startDate)
    .lte('snapshot_date', endDate)
    .order('snapshot_date', { ascending: false });

  if (error) {
    console.error('Error fetching manual metric values:', error);
    throw new Error(`Failed to fetch manual metric values: ${error.message}`);
  }

  return (data || []) as Array<{ snapshot_date: string; value: number | boolean; entered_by: string; entered_at: string }>;
}

/**
 * Delete manual metric value
 */
export async function deleteManualMetricValue(
  epicId: string,
  metricId: string,
  snapshotDate: string
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('manual_metric_values')
    .delete()
    .eq('epic_id', epicId)
    .eq('metric_id', metricId)
    .eq('snapshot_date', snapshotDate);

  if (error) {
    console.error('Error deleting manual metric value:', error);
    throw new Error(`Failed to delete manual metric value: ${error.message}`);
  }
}

