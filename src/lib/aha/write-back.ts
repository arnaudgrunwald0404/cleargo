import { createClient } from '@supabase/supabase-js';
import { updateEpicCustomFields } from './client';
import { buildWriteBackPayload } from './mapping';
import type { LaunchReadinessData } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface LaunchWithReadiness {
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

function hasChanges(
    launchId: string,
    current: LastSyncedValues
): boolean {
    const last = lastSyncCache.get(launchId);

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

function updateSyncCache(launchId: string, data: LastSyncedValues): void {
    lastSyncCache.set(launchId, { ...data });
}

export async function writeBackLaunchReadiness(launchId: string): Promise<void> {
    // Fetch launch with all write-back fields
    const { data: launch, error } = await supabase
        .from('launch')
        .select('id, aha_id, readiness_status, readiness_score, risk_level, last_go_no_go_decision_date, console_url, tier, target_launch_date')
        .eq('id', launchId)
        .single();

    if (error) {
        throw new Error(`Failed to fetch launch: ${error.message}`);
    }

    if (!launch.aha_id) {
        console.warn(`Launch ${launchId} has no aha_id, skipping write-back`);
        return;
    }

    const launchData: LastSyncedValues = {
        readiness_status: launch.readiness_status,
        readiness_score: launch.readiness_score,
        risk_level: launch.risk_level,
        last_go_no_go_decision_date: launch.last_go_no_go_decision_date,
        console_url: launch.console_url,
        tier: launch.tier,
        target_launch_date: launch.target_launch_date,
    };

    // Check if values have changed since last sync (idempotency)
    if (!hasChanges(launchId, launchData)) {
        console.log(`No changes detected for launch ${launchId}, skipping write-back`);
        return;
    }

    // Build custom fields payload
    const customFields = buildWriteBackPayload(launchData);

    if (Object.keys(customFields).length === 0) {
        console.log(`No fields to write back for launch ${launchId}`);
        return;
    }

    try {
        // Write back to Aha
        await updateEpicCustomFields(launch.aha_id, customFields);

        // Update cache
        updateSyncCache(launchId, launchData);

        // Log success
        console.log(`Successfully wrote back ${Object.keys(customFields).length} fields for launch ${launchId} (aha_id: ${launch.aha_id})`);

    } catch (error) {
        console.error(`Failed to write back to Aha for launch ${launchId}:`, error);
        throw error;
    }
}
