import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MappedLaunchData } from '../aha/mapping';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface Launch {
    id: string;
    aha_id: string | null;
    aha_url: string | null;
    name: string;
    product_id: string | null;
    tier: string;
    target_launch_date: string | null;
    status: string;
    readiness_score: number | null;
    readiness_status: string | null;
    risk_level: string | null;
    owner_id: string | null;
    owner_email: string | null;
    business_priority: string | null;
    csm_priority: string | null;
    tags: string[] | null;
    product_component: string | null;
    pod: string | null;
    console_url: string | null;
    last_go_no_go_decision_date: string | null;
    scheduled_ga_dev_date: string | null;
    modified_rice_score: any | null;
    wsjf_score: any | null;
    gtm_link: string | null;
    activation_process: string | null;
    new_org_setup: string | null;
    existing_org_setup: string | null;
    pricing_model: string | null;
    aha_fields?: Record<string, any> | null; // Dynamic AHA fields (standard and custom)
    created_at: string;
    updated_at: string;
}

export async function getLaunchByAhaId(ahaId: string): Promise<Launch | null> {
    const { data, error } = await supabase
        .from('launch')
        .select('*')
        .eq('aha_id', ahaId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
    }

    return data;
}

export async function upsertLaunchFromAha(
    launchData: MappedLaunchData,
    ownerId: string | null = null
): Promise<Launch> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // First, check if launch exists
    const existing = await getLaunchByAhaId(launchData.aha_id);

    const upsertData: any = {
        aha_id: launchData.aha_id,
        aha_url: launchData.aha_url,
        name: launchData.name,
        tier: launchData.tier,
        target_launch_date: launchData.target_launch_date,
        scheduled_ga_dev_date: launchData.scheduled_ga_dev_date,
        owner_email: launchData.owner_email,
        product_component: launchData.product_component,
        pod: launchData.pod,
        business_priority: launchData.business_priority,
        csm_priority: launchData.csm_priority,
        tags: launchData.tags,
        modified_rice_score: launchData.modified_rice_score,
        wsjf_score: launchData.wsjf_score,
        gtm_link: launchData.gtm_link,
        activation_process: launchData.activation_process,
        new_org_setup: launchData.new_org_setup,
        existing_org_setup: launchData.existing_org_setup,
        pricing_model: launchData.pricing_model,
        // aha_fields already contains all standard fields and custom fields from mapEpicToLaunch
        aha_fields: launchData.aha_fields || null,
        updated_at: new Date().toISOString(),
    };

    // Resolve launch date from release schedule if release name is present
    // Note: target_launch_date is now text, so we convert dates to ISO string format
    if (launchData.aha_release_name) {
        const { data: releaseSchedule } = await supabase
            .from('release_schedule')
            .select('launch_date')
            .eq('release_name', launchData.aha_release_name)
            .single();

        if (releaseSchedule?.launch_date) {
            // Convert date to ISO string if it's a Date object, otherwise use as-is (already string)
            upsertData.target_launch_date = releaseSchedule.launch_date instanceof Date 
                ? releaseSchedule.launch_date.toISOString().split('T')[0] 
                : String(releaseSchedule.launch_date);
        }
    }

    if (ownerId) {
        upsertData.owner_id = ownerId;
    }

    // Only set console_url for new launches
    if (!existing) {
        upsertData.status = 'PLANNED';
    }

    const { data, error } = await supabase
        .from('launch')
        .upsert(upsertData, { onConflict: 'aha_id' })
        .select()
        .single();

    if (error) throw error;

    // Update console_url after we have the ID
    if (data && !data.console_url) {
        const consoleUrl = `${appUrl}/launches/${data.id}`;
        const { data: updated, error: updateError } = await supabase
            .from('launch')
            .update({ console_url: consoleUrl })
            .eq('id', data.id)
            .select()
            .single();

        if (updateError) throw updateError;
        return updated;
    }

    return data;
}

export async function getUserByEmail(email: string): Promise<{ id: string } | null> {
    const { data, error } = await supabase
        .from('app_user')
        .select('id')
        .eq('email', email)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }

    return data;
}

export async function getFallbackProductOpsUser(): Promise<string> {
    const { data, error } = await supabase
        .from('app_settings')
        .select('fallback_user_email')
        .eq('id', 1)
        .single();

    if (error || !data?.fallback_user_email) {
        throw new Error('Fallback user email not configured');
    }

    const user = await getUserByEmail(data.fallback_user_email);
    if (!user) {
        throw new Error(`Fallback user not found: ${data.fallback_user_email}`);
    }

    return user.id;
}

export async function instantiateCriteriaForLaunch(
    launchId: string,
    tier: string,
    client?: SupabaseClient
): Promise<void> {
    // Prefer the passed-in client (SSR client for this request) to ensure we hit the same project
    const sb = client ?? supabase;

    // Get all active criteria applicable to this tier
    const { data: criteria, error: criteriaError } = await sb
        .from('criterion')
        .select('id, tier_applicability')
        .eq('is_active', true);

    if (criteriaError) throw criteriaError;

    const applicableCriteria = criteria.filter((c) => {
        // ALL criteria apply to all tiers
        if (c.tier_applicability === 'ALL') return true;
        // TIER_1_ONLY applies only to TIER_1
        if (c.tier_applicability === 'TIER_1_ONLY' && tier === 'TIER_1') return true;
        // TIER_1_AND_2 applies to TIER_1 and TIER_2
        if (c.tier_applicability === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2')) return true;
        // For TIER_3, only ALL criteria apply (already handled above)
        return false;
    });

    // Check if criteria already exist for this launch
    const { data: existing } = await sb
        .from('launch_criterion_status')
        .select('criterion_id')
        .eq('launch_id', launchId);

    const existingCriterionIds = new Set(existing?.map((e) => e.criterion_id) ?? []);

    // Create launch_criterion_status records for new criteria only
    const newRecords = applicableCriteria
        .filter((c) => !existingCriterionIds.has(c.id))
        .map((c) => ({
            launch_id: launchId,
            criterion_id: c.id,
            status: 'NOT_SET',
            last_updated_at: new Date().toISOString(),
        }));

    if (newRecords.length > 0) {
        const { error: insertError } = await sb
            .from('launch_criterion_status')
            .insert(newRecords);

        if (insertError) throw insertError;
    }
}

export async function updateLaunchReadiness(
    launchId: string,
    readinessData: {
        readiness_status: string | null;
        readiness_score: number | null;
        risk_level: string | null;
        last_go_no_go_decision_date?: string | null;
    }
): Promise<void> {
    const { error } = await supabase
        .from('launch')
        .update({
            readiness_status: readinessData.readiness_status,
            readiness_score: readinessData.readiness_score,
            risk_level: readinessData.risk_level,
            last_go_no_go_decision_date: readinessData.last_go_no_go_decision_date,
            updated_at: new Date().toISOString(),
        })
        .eq('id', launchId);

    if (error) throw error;
}
