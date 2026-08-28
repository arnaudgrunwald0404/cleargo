/**
 * Supabase client and API helpers for the MCP server.
 *
 * All database access goes through the service-role client (bypasses RLS).
 * Authorization is enforced at the tool layer via the actor's roles.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// ── Supabase client ─────────────────────────────────────────────────────────

/**
 * Service-role client — bypasses RLS.
 * Authorization is application-level (actor roles), not row-level.
 */
export function createAdminClient() {
  return createClient(config.supabaseUrl, config.supabaseServiceKey, {
    global: {
      headers: {
        'X-Client-Info': 'cleargo-mcp-server',
      },
    },
  });
}

// ── API client ──────────────────────────────────────────────────────────────

/**
 * Call an internal ClearGO API endpoint with MCP_SECRET authentication.
 */
export async function callInternalApi(path: string, body?: Record<string, unknown>): Promise<unknown> {
  const url = `${config.appUrl}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.mcpSecret}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Internal API ${path} failed (${res.status}): ${text}`);
  }

  return res.json().catch(() => ({}));
}

// ── Type helpers ────────────────────────────────────────────────────────────

export type ArtifactType =
  | 'gate_checklist'
  | 'story_brief'
  | 'messaging_brief'
  | 'enablement_guide'
  | 'marketing_brief';

export type ArtifactStatus =
  | 'NOT_STARTED'
  | 'DRAFTING'
  | 'PENDING_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED';

export interface LaunchArtifact {
  id: string;
  launch_id: string;
  artifact_type: ArtifactType;
  criterion_id: string | null;
  doc_id: string | null;
  doc_url: string | null;
  status: ArtifactStatus;
  version: string;
  owner_email: string | null;
  ai_draft: Record<string, unknown>;
  context_snapshot: Record<string, unknown>;
  validation_snapshot: Record<string, unknown>;
  change_request_note: string | null;
  generation: number;
  last_drafted_at: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LaunchSummary {
  id: string;
  name: string;
  tier: 'TIER_1' | 'TIER_2' | null;
  target_launch_date: string | null;
  status: string;
  owner_email: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}