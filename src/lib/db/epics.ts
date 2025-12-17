import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MappedEpicData } from '../aha/mapping';

// Use new secret key, fallback to legacy service_role key for backward compatibility
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  throw new Error(
    'Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in environment variables'
  );
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseServiceKey);

export interface Epic {
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
  // Extended fields (from migration 0004) - may not exist in all deployments
  // These are also stored in aha_fields for flexibility
  modified_rice_score?: any | null;
  wsjf_score?: any | null;
  gtm_link?: string | null;
  activation_process?: string | null;
  new_org_setup?: string | null;
  existing_org_setup?: string | null;
  pricing_model?: string | null;
  aha_fields?: Record<string, any> | null; // Dynamic AHA fields (standard and custom)
  created_at: string;
  updated_at: string;
}

export async function getEpicByAhaId(ahaId: string): Promise<Epic | null> {
  const { data, error } = await supabase.from('epic').select('*').eq('aha_id', ahaId).single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return data;
}

export async function upsertEpicFromAha(
  epicData: MappedEpicData,
  ownerId: string | null = null
): Promise<Epic> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // First, check if epic exists
  const existing = await getEpicByAhaId(epicData.aha_id);

  // Include all fields from the mapped epic data
  const upsertData: any = {
    aha_id: epicData.aha_id,
    aha_url: epicData.aha_url,
    name: epicData.name,
    tier: epicData.tier,
    target_launch_date: epicData.target_launch_date,
    scheduled_ga_dev_date: epicData.scheduled_ga_dev_date,
    owner_email: epicData.owner_email,
    product_component: epicData.product_component,
    pod: epicData.pod,
    business_priority: epicData.business_priority,
    csm_priority: epicData.csm_priority,
    tags: epicData.tags,
    modified_rice_score: epicData.modified_rice_score,
    wsjf_score: epicData.wsjf_score,
    gtm_link: epicData.gtm_link,
    activation_process: epicData.activation_process,
    new_org_setup: epicData.new_org_setup,
    existing_org_setup: epicData.existing_org_setup,
    pricing_model: epicData.pricing_model,
    aha_fields: epicData.aha_fields,
    updated_at: new Date().toISOString(),
  };

  // Resolve launch date from release schedule if release name is present
  // Note: target_launch_date is now text, so we convert dates to ISO string format
  if (epicData.aha_release_name) {
    // Use maybeSingle() to avoid PGRST116 error when release doesn't exist
    const { data: releaseSchedule, error: releaseError } = await supabase
      .from('release_schedule')
      .select('launch_date')
      .eq('release_name', epicData.aha_release_name)
      .maybeSingle();

    if (releaseError) {
      console.warn('Error fetching release schedule:', releaseError);
    } else if (releaseSchedule?.launch_date) {
      // Convert date to ISO string if it's a Date object, otherwise use as-is (already string)
      upsertData.target_launch_date =
        releaseSchedule.launch_date instanceof Date
          ? releaseSchedule.launch_date.toISOString().split('T')[0]
          : String(releaseSchedule.launch_date);
    }
  }

  if (ownerId) {
    upsertData.owner_id = ownerId;
  }

  // Only set console_url for new epics
  if (!existing) {
    upsertData.status = 'PLANNED';
  }

  const { data, error } = await supabase
    .from('epic')
    .upsert(upsertData, { onConflict: 'aha_id' })
    .select()
    .single();

  if (error) throw error;

  // Update console_url after we have the ID
  if (data && !data.console_url) {
    const consoleUrl = `${appUrl}/epics/${data.id}`;
    const { data: updated, error: updateError } = await supabase
      .from('epic')
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
  const { data, error } = await supabase.from('app_user').select('id').eq('email', email).single();

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

  // Use env var fallback if settings not configured
  const fallbackEmail =
    data?.fallback_user_email ||
    process.env.FALLBACK_PRODUCT_OPS_EMAIL ||
    'agrunwald@clearcompany.com';

  const user = await getUserByEmail(fallbackEmail);
  if (!user) {
    // If fallback user doesn't exist, try to find any PRODUCT_OPS user
    const { data: productOpsUser } = await supabase
      .from('app_user')
      .select('id')
      .contains('roles', ['PRODUCT_OPS'])
      .limit(1)
      .single();

    if (productOpsUser) {
      return productOpsUser.id;
    }

    // Last resort: return the first admin user
    const { data: adminUser } = await supabase
      .from('app_user')
      .select('id')
      .or('roles.cs.{SUPERADMIN},roles.cs.{CPO}')
      .limit(1)
      .single();

    if (adminUser) {
      return adminUser.id;
    }

    throw new Error(`Fallback user not found: ${fallbackEmail}`);
  }

  return user.id;
}

export async function instantiateCriteriaForEpic(
  epicId: string,
  tier: string,
  client?: SupabaseClient
): Promise<void> {
  // Prefer the passed-in client (SSR client for this request) to ensure we hit the same project
  const sb = client ?? supabase;

  // Validate inputs
  if (!epicId) {
    throw new Error('Epic ID is required');
  }
  if (!tier) {
    throw new Error(`Epic tier is required (epicId: ${epicId})`);
  }

  // Get all active criteria applicable to this tier
  const { data: criteria, error: criteriaError } = await sb
    .from('criterion')
    .select('id, tier_applicability')
    .eq('is_active', true);

  if (criteriaError) {
    console.error('Error fetching criteria:', criteriaError);
    throw new Error(`Failed to fetch criteria: ${criteriaError.message}`);
  }

  if (!criteria || criteria.length === 0) {
    console.warn(`No active criteria found for instantiation (epicId: ${epicId}, tier: ${tier})`);
    return; // Nothing to instantiate
  }

  const applicableCriteria = criteria.filter((c) => {
    // ALL criteria apply to all tiers
    if (c.tier_applicability === 'ALL') return true;
    // TIER_1_ONLY applies only to TIER_1
    if (c.tier_applicability === 'TIER_1_ONLY' && tier === 'TIER_1') return true;
    // TIER_1_AND_2 applies to TIER_1 and TIER_2
    if (c.tier_applicability === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2'))
      return true;
    // For TIER_3, only ALL criteria apply (already handled above)
    return false;
  });

  console.log(
    `Found ${applicableCriteria.length} applicable criteria for epic ${epicId} (tier: ${tier})`
  );

  // Check if criteria already exist for this epic
  const { data: existing, error: existingError } = await sb
    .from('epic_criterion_status')
    .select('criterion_id')
    .eq('epic_id', epicId);

  if (existingError) {
    console.error('Error checking existing criteria:', existingError);
    throw new Error(`Failed to check existing criteria: ${existingError.message}`);
  }

  const existingCriterionIds = new Set(existing?.map((e) => e.criterion_id) ?? []);

  // Create epic_criterion_status records for new criteria only
  const newRecords = applicableCriteria
    .filter((c) => !existingCriterionIds.has(c.id))
    .map((c) => ({
      epic_id: epicId,
      criterion_id: c.id,
      status: 'NOT_SET',
      last_updated_at: new Date().toISOString(),
    }));

  if (newRecords.length > 0) {
    console.log(`Inserting ${newRecords.length} new criteria records for epic ${epicId}`);
    const { error: insertError } = await sb.from('epic_criterion_status').insert(newRecords);

    if (insertError) {
      console.error('Error inserting criteria:', insertError);
      throw new Error(`Failed to insert criteria: ${insertError.message}`);
    }
    console.log(`Successfully instantiated ${newRecords.length} criteria for epic ${epicId}`);
  } else {
    console.log(
      `No new criteria to insert for epic ${epicId} (all applicable criteria already exist)`
    );
  }
}

export async function updateEpicReadiness(
  epicId: string,
  readinessData: {
    readiness_status: string | null;
    readiness_score: number | null;
    risk_level: string | null;
    last_go_no_go_decision_date?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from('epic')
    .update({
      readiness_status: readinessData.readiness_status,
      readiness_score: readinessData.readiness_score,
      risk_level: readinessData.risk_level,
      last_go_no_go_decision_date: readinessData.last_go_no_go_decision_date,
      updated_at: new Date().toISOString(),
    })
    .eq('id', epicId);

  if (error) throw error;
}
