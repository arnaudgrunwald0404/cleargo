import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client (server-side)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface SnapshotData {
    launch: any;
    criteria_statuses: any[];
    readiness: {
        score: number | null;
        status: string;
        risk: string | null;
    };
}

export async function createSnapshot(
    launchId: string,
    decisionType: string,
    verdict: string,
    notes: string,
    userId: string
) {
    // 1. Fetch current launch state
    const { data: launch, error: launchError } = await supabase
        .from('launch')
        .select('*')
        .eq('id', launchId)
        .single();

    if (launchError) throw new Error(`Error fetching launch: ${launchError.message}`);

    // 2. Fetch all criteria statuses for this launch
    const { data: criteriaStatuses, error: criteriaError } = await supabase
        .from('launch_criterion_status')
        .select(`
      *,
      criterion:criterion_id (
        label,
        category,
        gate,
        tier_applicability,
        decision_owner_email
      )
    `)
        .eq('launch_id', launchId);

    if (criteriaError) throw new Error(`Error fetching criteria: ${criteriaError.message}`);

    // 3. Construct snapshot data blob
    const snapshotData: SnapshotData = {
        launch: launch,
        criteria_statuses: criteriaStatuses,
        readiness: {
            score: launch.readiness_score,
            status: launch.readiness_status || launch.status, // Fallback if readiness_status not distinct
            risk: launch.risk_level,
        },
    };

    // 4. Insert into decision_snapshot
    const { data: snapshot, error: snapshotError } = await supabase
        .from('decision_snapshot')
        .insert({
            launch_id: launchId,
            decision_type: decisionType,
            verdict: verdict,
            notes: notes,
            created_by: userId,
            snapshot_data: snapshotData,
        })
        .select()
        .single();

    if (snapshotError) throw new Error(`Error creating snapshot: ${snapshotError.message}`);

    return snapshot;
}

export async function getSnapshots(launchId: string) {
    const { data, error } = await supabase
        .from('decision_snapshot')
        .select(`
      *,
      creator:created_by (
        name,
        email
      )
    `)
        .eq('launch_id', launchId)
        .order('taken_at', { ascending: false });

    if (error) throw new Error(`Error fetching snapshots: ${error.message}`);
    return data;
}
