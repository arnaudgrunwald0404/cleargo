import { createClient } from '@supabase/supabase-js';
import { updateEpicCustomFields } from './client';
import { buildWriteBackPayload } from './mapping';
import type { EpicReadinessData } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Use new secret key, fallback to legacy service_role key for backward compatibility
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  throw new Error(
    'Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in environment variables'
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface EpicWithReadiness {
  id: string;
  aha_id: string | null;
  readiness_status: string | null;
  readiness_score: number | null;
  risk_level: string | null;
  last_go_no_go_decision_date: string | null;
  console_url: string | null;
  tier: string | null;
  target_launch_date: string | null;
}

// Track last synced values to implement idempotency
interface LastSyncedValues {
  readiness_status: string | null;
  readiness_score: number | null;
  risk_level: string | null;
  last_go_no_go_decision_date: string | null;
  console_url: string | null;
  tier: string | null;
  target_launch_date: string | null;
}

const lastSyncCache = new Map<string, LastSyncedValues>();

function hasChanges(epicId: string, current: LastSyncedValues): boolean {
  const last = lastSyncCache.get(epicId);

  if (!last) return true; // First sync

  return (
    last.readiness_status !== current.readiness_status ||
    last.readiness_score !== current.readiness_score ||
    last.risk_level !== current.risk_level ||
    last.last_go_no_go_decision_date !== current.last_go_no_go_decision_date ||
    last.console_url !== current.console_url ||
    last.tier !== current.tier ||
    last.target_launch_date !== current.target_launch_date
  );
}

function updateSyncCache(epicId: string, data: LastSyncedValues): void {
  lastSyncCache.set(epicId, { ...data });
}

export async function writeBackEpicReadiness(epicId: string): Promise<void> {
  // Fetch epic with all write-back fields
  // TODO: After migration 0018 is applied, change back to 'epic' table
  const { data: epic, error } = await supabase
    .from('epic')
    .select(
      'id, aha_id, readiness_status, readiness_score, risk_level, last_go_no_go_decision_date, console_url, tier, target_launch_date'
    )
    .eq('id', epicId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch epic: ${error.message}`);
  }

  if (!epic.aha_id) {
    console.warn(`Epic ${epicId} has no aha_id, skipping write-back`);
    return;
  }

  const epicData: LastSyncedValues = {
    readiness_status: epic.readiness_status,
    readiness_score: epic.readiness_score,
    risk_level: epic.risk_level,
    last_go_no_go_decision_date: epic.last_go_no_go_decision_date,
    console_url: epic.console_url,
    tier: epic.tier,
    target_launch_date: epic.target_launch_date,
  };

  // Check if values have changed since last sync (idempotency)
  if (!hasChanges(epicId, epicData)) {
    console.log(`No changes detected for epic ${epicId}, skipping write-back`);
    return;
  }

  // Build custom fields payload
  const customFields = buildWriteBackPayload(epicData);

  if (Object.keys(customFields).length === 0) {
    console.log(`No fields to write back for epic ${epicId}`);
    return;
  }

  try {
    // Write back to Aha
    await updateEpicCustomFields(epic.aha_id, customFields);

    // Update cache
    updateSyncCache(epicId, epicData);

    // Log success
    console.log(
      `Successfully wrote back ${Object.keys(customFields).length} fields for epic ${epicId} (aha_id: ${epic.aha_id})`
    );
  } catch (error) {
    console.error(`Failed to write back to Aha for epic ${epicId}:`, error);
    throw error;
  }
}
