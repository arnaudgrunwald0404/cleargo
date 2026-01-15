/**
 * Pendo Integration Service
 * Handles Pendo integration configuration and metric value fetching
 */

import { getClient } from '@/lib/db';
import { PendoClient } from './client';
import type { SuccessMetric, MeasurementType } from '@/lib/success/types';

export interface PendoIntegration {
  id: string;
  api_key_encrypted: string;
  environment: string;
  last_sync: string | null;
  status: 'connected' | 'disconnected' | 'error';
  created_at: string;
  updated_at: string;
}

/**
 * Get active Pendo integration configuration
 */
export async function getPendoIntegration(): Promise<PendoIntegration | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('pendo_integrations')
    .select('*')
    .eq('status', 'connected')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // No integration found
    }
    console.error('Error fetching Pendo integration:', error);
    throw new Error(`Failed to fetch Pendo integration: ${error.message}`);
  }

  return data as PendoIntegration;
}

/**
 * Decrypt API key (placeholder - implement actual decryption)
 * TODO: Implement proper encryption/decryption using environment secrets
 */
function decryptApiKey(encryptedKey: string): string {
  // For now, assume the key is stored encrypted but we'll decrypt it
  // In production, use proper encryption (e.g., using Supabase Vault or environment variables)
  // This is a placeholder - implement based on your encryption strategy
  return encryptedKey; // TODO: Implement actual decryption
}

export interface PendoMetricOptions {
  /**
   * Optional list of Pendo segment IDs to filter by.
   * Semantics: union – include activity from any of the segments.
   */
  pendoSegmentIds?: string[] | null;
  /**
   * Optional list of human-readable segment names (for logging/diagnostics only).
   */
  pendoSegmentNames?: string[] | null;
  /**
   * Optional list of Pendo app identifiers.
   * For now these are passed through to filters; aggregation behaviour is
   * handled by the consumer.
   */
  pendoAppIds?: string[] | null;
  /**
   * Optional list of app names (for logging/diagnostics only).
   */
  pendoAppNames?: string[] | null;
}

/**
 * Fetch metric value from Pendo for a given metric and epic
 */
export async function fetchMetricValue(
  metric: SuccessMetric,
  epicId: string,
  snapshotDate: string,
  options?: PendoMetricOptions
): Promise<number | boolean | null> {
  if (metric.source !== 'PENDO' || !metric.pendo_event_id) {
    throw new Error('Metric is not a Pendo metric or missing pendo_event_id');
  }

  const integration = await getPendoIntegration();
  if (!integration) {
    console.warn('Pendo integration not configured');
    return null;
  }

  try {
    const apiKey = decryptApiKey(integration.api_key_encrypted);
    const client = new PendoClient({
      apiKey,
      environment: integration.environment,
    });

    // Calculate date range (e.g., last 7 days from snapshot date)
    const snapshot = new Date(snapshotDate);
    const endDate = snapshot.toISOString().split('T')[0];
    const startDate = new Date(snapshot);
    startDate.setDate(startDate.getDate() - 7);
    const startDateStr = startDate.toISOString().split('T')[0];

    let value: number | boolean | null = null;

    // Build generic filters object for Pendo Aggregation API.
    // Exact shape can be adjusted once a concrete Pendo query is implemented.
    const filters: Record<string, any> = {
      epicId,
    };

    if (options?.pendoSegmentIds && options.pendoSegmentIds.length > 0) {
      filters.segmentIds = options.pendoSegmentIds;
    }

    if (options?.pendoAppIds && options.pendoAppIds.length > 0) {
      filters.appIds = options.pendoAppIds;
    }

    switch (metric.measurement_type) {
      case 'PERCENTAGE':
        value = await client.getEventPercentage({
          eventId: metric.pendo_event_id,
          startDate: startDateStr,
          endDate,
          filters,
        });
        break;
      case 'COUNT':
        value = await client.getEventCount({
          eventId: metric.pendo_event_id,
          startDate: startDateStr,
          endDate,
          filters,
        });
        break;
      case 'BOOLEAN':
        // For boolean, check if percentage > threshold (e.g., 50%)
        const percentage = await client.getEventPercentage({
          eventId: metric.pendo_event_id,
          startDate: startDateStr,
          endDate,
          filters,
        });
        value = percentage > 50;
        break;
      case 'DURATION':
        // Duration might need a different Pendo endpoint
        // For now, return count as placeholder
        value = await client.getEventCount({
          eventId: metric.pendo_event_id,
          startDate: startDateStr,
          endDate,
        });
        break;
      default:
        throw new Error(`Unsupported measurement type: ${metric.measurement_type}`);
    }

    // Update last_sync timestamp
    await updateLastSync(integration.id);

    return value;
  } catch (error: any) {
    console.error('Error fetching metric value from Pendo:', error);
    // Update integration status to error
    await updateIntegrationStatus(integration.id, 'error');
    return null;
  }
}

/**
 * Fetch activation data for benchmark comparison
 */
export async function fetchActivationData(
  epicId: string,
  launchDate: string,
  horizons: number[]
): Promise<number[] | null> {
  const integration = await getPendoIntegration();
  if (!integration) {
    console.warn('Pendo integration not configured');
    return null;
  }

  try {
    const apiKey = decryptApiKey(integration.api_key_encrypted);
    const client = new PendoClient({
      apiKey,
      environment: integration.environment,
    });

    const activations = await client.getActivationData({
      epicId,
      launchDate,
      horizons,
    });

    // Update last_sync timestamp
    await updateLastSync(integration.id);

    return activations;
  } catch (error: any) {
    console.error('Error fetching activation data from Pendo:', error);
    await updateIntegrationStatus(integration.id, 'error');
    return null;
  }
}

/**
 * Update last_sync timestamp
 */
async function updateLastSync(integrationId: string): Promise<void> {
  const supabase = getClient();
  await supabase
    .from('pendo_integrations')
    .update({
      last_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', integrationId);
}

/**
 * Update integration status
 */
async function updateIntegrationStatus(
  integrationId: string,
  status: 'connected' | 'disconnected' | 'error'
): Promise<void> {
  const supabase = getClient();
  await supabase
    .from('pendo_integrations')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integrationId);
}

