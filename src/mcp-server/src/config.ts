/**
 * Environment configuration for the ClearGO MCP server.
 *
 * Loads .env from the project root (../../.env) on startup so the developer
 * doesn't have to duplicate values.  Required variables throw at import time
 * so misconfiguration fails fast with a clear message.
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// ── Dotenv bootstrap ────────────────────────────────────────────────────────
// The compiled server lives at dist/src/config.js at runtime, but during dev
// (tsx watch) it's src/src/config.ts.  Walk up from __dirname to find .env.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

for (const offset of [2, 3]) {
  const candidate = resolve(__dirname, '../'.repeat(offset), '.env');
  if (existsSync(candidate)) {
    dotenvConfig({ path: candidate });
    break;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// ── Config ──────────────────────────────────────────────────────────────────

export const config = {
  /** Supabase project URL (e.g. https://xyz.supabase.co) */
  supabaseUrl: requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),

  /** Service-role key — bypasses RLS for all MCP operations */
  supabaseServiceKey:
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY') || requiredEnv('SUPABASE_SECRET_KEY'),

  /**
   * URL of the ClearGO app for API calls (draft triggers, etc.).
   * Defaults to localhost:3000 when not set — covers the common dev flow.
   */
  appUrl: (process.env.CLEARGO_APP_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, ''),

  /** Shared secret for internal API endpoints (draft trigger) */
  mcpSecret: requiredEnv('MCP_SECRET'),

  /**
   * Optional — identifies who the MCP server acts as.
   * When set, the server looks up the app_user row and uses those roles
   * for capability checks on write operations.
   */
  actorEmail: process.env.MCP_ACTOR_EMAIL?.trim() || '',
} as const;