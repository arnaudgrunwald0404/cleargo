/**
 * Database connection wrapper for success measurement queries
 * Wraps Supabase client for simple query interface
 */
import { createClient, createAdminClient } from './supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Optional override for admin client (e.g. Netlify background function where Next server client is not available) */
let _overrideAdminClient: SupabaseClient | null = null;
export function setOverrideAdminClient(client: SupabaseClient | null): void {
  _overrideAdminClient = client;
}

/**
 * Execute a raw SQL query using Supabase
 * Note: Supabase doesn't support raw SQL directly, so this is a placeholder
 * For actual queries, use Supabase's query builder methods
 */
export async function query(sql: string, params?: any[]): Promise<any[]> {
  // Supabase doesn't support raw SQL queries directly
  // This is a placeholder - actual implementation would need to use
  // Supabase's query builder or RPC functions
  throw new Error('Raw SQL queries not supported. Use Supabase query builder methods instead.');
}

/**
 * Execute a query and return a single row
 */
export async function queryOne(sql: string, params?: any[]): Promise<any | null> {
  const results = await query(sql, params);
  return results[0] || null;
}

/**
 * Get a Supabase client for query builder usage
 */
export function getClient(): SupabaseClient {
  return createClient();
}

/**
 * Get an admin Supabase client (bypasses RLS)
 */
export function getAdminClient(): SupabaseClient {
  if (_overrideAdminClient) return _overrideAdminClient;
  return createAdminClient();
}

