/**
 * Snowflake Integration Service
 * Handles Snowflake configuration and metric value fetching
 * 
 * Note: This is a structure/placeholder. Actual implementation will depend on
 * Snowflake connection details and environment configuration.
 */

import { SnowflakeClient } from './client';
import type { SuccessMetric } from '@/lib/success/types';

/**
 * Get Snowflake configuration from environment variables
 */
function getSnowflakeConfig(): SnowflakeConfig | null {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const username = process.env.SNOWFLAKE_USERNAME;
  const password = process.env.SNOWFLAKE_PASSWORD;
  const warehouse = process.env.SNOWFLAKE_WAREHOUSE;
  const database = process.env.SNOWFLAKE_DATABASE;
  const schema = process.env.SNOWFLAKE_SCHEMA;

  if (!account || !username || !password) {
    return null;
  }

  return {
    account,
    username,
    password,
    warehouse,
    database,
    schema,
  };
}

interface SnowflakeConfig {
  account: string;
  username: string;
  password: string;
  warehouse?: string;
  database?: string;
  schema?: string;
}

/**
 * Get Snowflake client instance
 */
function getSnowflakeClient(): SnowflakeClient | null {
  const config = getSnowflakeConfig();
  if (!config) {
    return null;
  }

  return new SnowflakeClient(config);
}

/**
 * Fetch metric value from Snowflake for a given metric and epic
 */
export async function fetchMetricValue(
  metric: SuccessMetric,
  epicId: string,
  snapshotDate: string
): Promise<number | boolean | null> {
  if (metric.source !== 'SNOWFLAKE') {
    throw new Error('Metric is not a Snowflake metric');
  }

  const client = getSnowflakeClient();
  if (!client) {
    console.warn('Snowflake not configured (missing environment variables)');
    return null;
  }

  try {
    const value = await client.getMetricValue(metric, epicId, snapshotDate);
    return value;
  } catch (error: any) {
    console.error('Error fetching metric value from Snowflake:', error);
    return null;
  } finally {
    // Close connection if needed
    await client.close();
  }
}

