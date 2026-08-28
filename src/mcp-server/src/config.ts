/**
 * Environment configuration for the ClearGO MCP server.
 *
 * For external users (npm install), config is loaded from `~/.cleargo/.env`.
 * For developers working in the ClearGO repo, the project root `.env` is used
 * as a fallback.
 *
 * Required variables throw at import time so misconfiguration fails fast.
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { homedir } from 'os';

// ── Dotenv bootstrap ────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try locations in order; first match wins.
const candidates: string[] = [
  // External user: ~/.cleargo/.env (created during setup)
  resolve(homedir(), '.cleargo', '.env'),
  // Developer: project root .env (two or three levels up from dist/)
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../../../.env'),
];

for (const candidate of candidates) {
  if (existsSync(candidate)) {
    dotenvConfig({ path: candidate });
    break;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function requiredEnv(name: string, hint?: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    const msg = `Missing required environment variable: ${name}`;
    if (hint) {
      throw new Error(`${msg}\n  ${hint}`);
    }
    throw new Error(msg);
  }
  return value;
}

// ── Config ──────────────────────────────────────────────────────────────────

export const config = {
  /** Supabase project URL (e.g. https://xyz.supabase.co) */
  supabaseUrl: requiredEnv('NEXT_PUBLIC_SUPABASE_URL',
    'Your ClearGO admin can provide this, or find it in your Supabase project settings.'),

  /** Service-role key — bypasses RLS for all MCP operations */
  supabaseServiceKey:
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'Also accepted as SUPABASE_SECRET_KEY. Ask your ClearGO admin.') ||
    requiredEnv('SUPABASE_SECRET_KEY', 'Ask your ClearGO admin for the service-role key.'),

  /**
   * URL of the ClearGO app for API calls (draft triggers, etc.).
   * Defaults to the production app when not set.
   */
  appUrl: (process.env.CLEARGO_APP_URL?.trim() || 'https://app.cleargo.app').replace(/\/+$/, ''),

  /**
   * Shared secret for internal API endpoints (draft trigger).
   * Without this, the server works for reads and direct writes but cannot
   * trigger AI drafts (which go through the app's agent pipeline).
   */
  mcpSecret: process.env.MCP_SECRET?.trim() || '',

  /**
   * Optional — identifies who the MCP server acts as.
   * When set, the server looks up the app_user row and uses those roles
   * for capability checks on write operations.
   */
  actorEmail: process.env.MCP_ACTOR_EMAIL?.trim() || '',
} as const;