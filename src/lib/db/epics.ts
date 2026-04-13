import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MappedEpicData } from '../aha/mapping';
import { getReleases } from '../aha/client';
import { resolveAndCacheJiraEpicKey } from '../jira/resolve-and-cache-epic-key';
import { syncUserSlackHandle } from '../slack/notifications';
import { pruneCriteria } from '../ai/client';
import { isEnabled, FEATURE_AI_PRUNING } from '../flags';
import { getFeatureFlags } from '../settings-db';
import {
    computeCriterionDueDateYmd,
    fetchAnchorLaunchDateForEpic,
    getReleaseNameFromAhaFields,
    getUiFrameworkDueDateOptions,
} from '../criterion-due-date';

// Use new secret key, fallback to legacy service_role key for backward compatibility
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in environment variables');
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseServiceKey
);

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
    modified_rice_score: any | null;
    wsjf_score: any | null;
    gtm_link: string | null;
    activation_process: string | null;
    new_org_setup: string | null;
    existing_org_setup: string | null;
    pricing_model: string | null;
    aha_fields?: Record<string, any> | null; // Dynamic AHA fields (standard and custom)
    archived: boolean;
    jira_epic_key: string | null;
    launch_ref: string | null;
    aha_record_not_found?: boolean;
    created_at: string;
    updated_at: string;
}

export async function getEpicByAhaId(ahaId: string): Promise<Epic | null> {
    const { data, error } = await supabase
        .from('epic')
        .select('*')
        .eq('aha_id', ahaId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
    }

    return data;
}

export async function getEpicById(id: string): Promise<Epic | null> {
    const { data, error } = await supabase
        .from('epic')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
    }

    return data;
}

/** Set aha_record_not_found = true for the epic with this aha_id (e.g. when Aha API returns 404). */
export async function setAhaRecordNotFoundByAhaId(ahaId: string): Promise<void> {
    const existing = await getEpicByAhaId(ahaId);
    if (!existing) return;
    await supabase.from('epic').update({ aha_record_not_found: true }).eq('id', existing.id);
}

/** Clear aha_record_not_found for the epic (e.g. after successful sync from Aha). */
export async function clearAhaRecordNotFound(epicId: string): Promise<void> {
    await supabase.from('epic').update({ aha_record_not_found: false }).eq('id', epicId);
}

/** Values from Aha ClearGO Candidate field that indicate the epic is a ClearGO candidate (shown in app, not archived). */
export const CLEARGO_CANDIDATE_VALUES = ['Yes', 'Yes - UI Framework'] as const;

/**
 * Extract cleargo_candidate value from epic data.
 * Returns true if cleargo_candidate is "Yes", "Yes - UI Framework", or true; false otherwise.
 */
function getClearGOCandidateValue(epicData: MappedEpicData): boolean {
    const raw = getClearGOCandidateRawValue(epicData);
    return raw === 'Yes' || raw === 'Yes - UI Framework' || raw === true;
}

/**
 * Get raw cleargo_candidate value from epic data (for UI Framework filtering).
 * Returns the string value from Aha (e.g. "Yes", "Yes - UI Framework", "No") or undefined.
 */
function normalizeLaunchYmd(v: string | null | undefined): string | null {
    if (v == null || String(v).trim() === '') return null;
    return String(v).trim().split('T')[0];
}

/**
 * When an epic moves between releases or its anchor launch date / UI-framework timing changes,
 * all criterion due dates must be recomputed from release schedule + rating_timing.
 */
function shouldRecalculateCriterionDueDatesAfterUpsert(existing: Epic, updated: Epic): boolean {
    if (normalizeLaunchYmd(existing.target_launch_date) !== normalizeLaunchYmd(updated.target_launch_date)) {
        return true;
    }
    const oldRel = getReleaseNameFromAhaFields(existing.aha_fields);
    const newRel = getReleaseNameFromAhaFields(updated.aha_fields);
    if ((oldRel ?? '') !== (newRel ?? '')) {
        return true;
    }
    const oldUi = getUiFrameworkDueDateOptions(existing.aha_fields);
    const newUi = getUiFrameworkDueDateOptions(updated.aha_fields);
    if (oldUi.isUiFramework !== newUi.isUiFramework || oldUi.uiLevel !== newUi.uiLevel) {
        return true;
    }
    return false;
}

export function getClearGOCandidateRawValue(epicData: { aha_fields?: { custom_fields?: Record<string, unknown> } | null }): string | boolean | undefined {
    const customFields = epicData.aha_fields?.custom_fields;
    if (!customFields || typeof customFields !== 'object') return undefined;
    const v = (customFields as Record<string, unknown>).cleargo_candidate;
    return v === null || v === undefined ? undefined : (v as string | boolean);
}

export async function upsertEpicFromAha(
    epicData: MappedEpicData,
    ownerId: string | null = null
): Promise<Epic> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // First, check if epic exists
    const existing = await getEpicByAhaId(epicData.aha_id);

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
        // aha_fields already contains all standard fields and custom fields from mapEpicToEpic
        aha_fields: epicData.aha_fields || null,
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
            upsertData.target_launch_date = releaseSchedule.launch_date instanceof Date
                ? releaseSchedule.launch_date.toISOString().split('T')[0]
                : String(releaseSchedule.launch_date);
        }
    }

    if (ownerId) {
        upsertData.owner_id = ownerId;
    }

    // Status is now computed from dates; only store 'Cancelled' override when needed

    // Determine archived status based on cleargo_candidate field
    // Archive if cleargo_candidate is not "Yes" or "Yes - UI Framework"; unarchive if it is either
    const isClearGOCandidate = getClearGOCandidateValue(epicData);
    const shouldBeArchived = !isClearGOCandidate;

    // Always set archived status (for both new and existing epics)
    // This ensures automatic archiving/unarchiving based on cleargo_candidate
    upsertData.archived = shouldBeArchived;

    // Log when archived status changes for existing epics
    if (existing) {
        const currentArchived = existing.archived ?? false;
        if (currentArchived !== shouldBeArchived) {
            console.log(
                `${shouldBeArchived ? '📦 Archiving' : '✅ Unarchiving'} epic ${epicData.aha_id} (${epicData.name}) - cleargo_candidate: ${isClearGOCandidate ? 'Yes' : 'No/Empty'}`
            );
        }
    }

    const { data, error } = await supabase
        .from('epic')
        .upsert(upsertData, { onConflict: 'aha_id' })
        .select()
        .single();

    if (error) throw error;

    // Update console_url after we have the ID
    let finalEpic = data;
    if (data && !data.console_url) {
        const consoleUrl = `${appUrl}/epics/${data.id}`;
        const { data: updated, error: updateError } = await supabase
            .from('epic')
            .update({ console_url: consoleUrl })
            .eq('id', data.id)
            .select()
            .single();

        if (updateError) throw updateError;
        finalEpic = updated;
    }

    // Log to activity feed if this is a new epic
    if (!existing && finalEpic) {
        // Use ownerId as actor, or fallback to Product Ops user
        const actorId = ownerId || await getFallbackProductOpsUser();

        try {
            await supabase.from('audit_log').insert({
                actor_id: actorId,
                entity_type: 'epic',
                entity_id: finalEpic.id,
                json_diff: {
                    name: { new: finalEpic.name },
                    tier: { new: finalEpic.tier },
                    aha_id: { new: finalEpic.aha_id },
                    aha_url: { new: finalEpic.aha_url },
                    target_launch_date: { new: finalEpic.target_launch_date },
                    status: { new: finalEpic.status },
                    source: 'aha_sync',
                },
            });
            console.log(`📝 Logged epic_added activity for ${finalEpic.name} (${finalEpic.id})`);
        } catch (auditError) {
            // Don't fail the epic creation if audit logging fails
            console.warn('Failed to log epic_added activity:', auditError);
        }
    }

    // Resolve and cache Jira epic key as soon as epic exists (Aha integrations then Jira search)
    if (finalEpic) {
        resolveAndCacheJiraEpicKey(
            {
                id: finalEpic.id,
                name: finalEpic.name,
                aha_id: finalEpic.aha_id,
                aha_fields: finalEpic.aha_fields ?? undefined,
                jira_epic_key: finalEpic.jira_epic_key,
            },
            supabase
        ).then((result) => {
            if (result.jiraEpicKey) {
                console.log(`✅ Jira epic key resolved for ${finalEpic.name} (${finalEpic.id}): ${result.jiraEpicKey} (source: ${result.source})`);
            }
        }).catch((err) => {
            console.warn('Jira epic key resolution after epic upsert:', err?.message ?? err);
        });
    }

    if (existing && finalEpic && shouldRecalculateCriterionDueDatesAfterUpsert(existing, finalEpic)) {
        try {
            await recalculateDueDatesForEpic(finalEpic.id, supabase);
            console.log(
                `📅 Recalculated criterion due dates after epic release/date anchor change: ${finalEpic.name} (${finalEpic.id})`
            );
        } catch (e) {
            console.error(`Failed to recalculate due dates after Aha upsert for epic ${finalEpic.id}:`, e);
        }
    }

    return finalEpic;
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

/**
 * Resolve decision owner IDs for criteria based on criterion templates and pod mapping
 */
async function resolveDecisionOwnersForCriteria(
    epicId: string,
    criteria: Array<{ id: string; decision_owner_email: string | null }>,
    pod: string | null,
    client: SupabaseClient
): Promise<Map<string, string>> {
    const ownerMap = new Map<string, string>();
    const { getSettings } = await import('../settings-db');
    const { resolveDecisionOwnerEmail } = await import('../pod-resolver');

    const settings = await getSettings();
    const podMapping = settings.pod_product_manager_mapping || {};

    for (const criterion of criteria) {
        if (!criterion.decision_owner_email) {
            continue;
        }

        // Resolve email (handles pod placeholder)
        const resolvedEmail = await resolveDecisionOwnerEmail(criterion.decision_owner_email, pod);
        if (!resolvedEmail) {
            continue;
        }

        // Look up user by email
        const { data: user } = await client
            .from('app_user')
            .select('id')
            .eq('email', resolvedEmail)
            .single();

        if (user?.id) {
            ownerMap.set(criterion.id, user.id);
        }
    }

    return ownerMap;
}

/**
 * Calculate due date from the anchor launch date (prefer release_schedule via callers that use
 * `fetchAnchorLaunchDateForEpic`) and rating timing (launch stage).
 * When uiLevel is provided (1, 2, or 3), stages with level_durations use that level's target (min_days) for duration.
 */
export async function calculateDueDateForCriterion(
    targetLaunchDate: string | null,
    ratingTimingId: number | null,
    client: SupabaseClient,
    options?: { uiLevel?: number }
): Promise<string | null> {
    const uiLevel = options?.uiLevel ?? null;

    const { data: allStages, error: stagesError } = await client
        .from('release_stages')
        .select('id, name, sort_order, duration_days, level_durations, scope')
        .order('sort_order', { ascending: true });

    if (stagesError || !allStages || allStages.length === 0) {
        console.warn('Failed to fetch release stages for due date calculation:', stagesError);
        return null;
    }

    return computeCriterionDueDateYmd({
        anchorYmd: targetLaunchDate,
        ratingTimingId,
        allStages,
        uiLevel,
    });
}

export async function instantiateReleaseCriteriaForEpic(
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

    // Get epic info (for target_launch_date, pod, owner, and cleargo_candidate for UI Framework criteria)
    const { data: epic, error: epicError } = await sb
        .from('epic')
        .select('id, target_launch_date, pod, owner_email, aha_fields')
        .eq('id', epicId)
        .single();

    if (epicError) {
        console.error('Error fetching epic:', epicError);
        throw new Error(`Failed to fetch epic: ${epicError.message}`);
    }

    // Get all active release criteria applicable to this tier (with decision_owner_email, rating_timing, ui_framework_only)
    const { data: criteria, error: criteriaError } = await sb
        .from('criterion')
        .select('id, label, description, tier_applicability, decision_owner_email, rating_timing, ui_framework_only')
        .eq('is_active', true)
        .eq('context', 'release');

    if (criteriaError) {
        console.error('Error fetching criteria:', criteriaError);
        throw new Error(`Failed to fetch criteria: ${criteriaError.message}`);
    }

    if (!criteria || criteria.length === 0) {
        console.warn(`No active criteria found for instantiation (epicId: ${epicId}, tier: ${tier})`);
        return; // Nothing to instantiate
    }

    const { isUiFramework: isUiFrameworkEpic, uiLevel } = getUiFrameworkDueDateOptions(epic?.aha_fields);

    const applicableCriteria = criteria.filter((c) => {
        // UI Framework only: include only when epic has ClearGO Candidate = "Yes - UI Framework"
        if ((c as { ui_framework_only?: boolean }).ui_framework_only === true) {
            if (!isUiFrameworkEpic) return false;
        }
        // ALL criteria apply to all tiers
        if (c.tier_applicability === 'ALL') return true;
        if (c.tier_applicability === 'TIER_1_ONLY' && tier === 'TIER_1') return true;
        if (c.tier_applicability === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2')) return true;
        if (c.tier_applicability === 'TIER_2_ONLY' && tier === 'TIER_2') return true;
        if (c.tier_applicability === 'TIER_3_ONLY' && tier === 'TIER_3') return true;
        return false;
    });

    console.log(`Found ${applicableCriteria.length} applicable criteria for epic ${epicId} (tier: ${tier})`);

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

    // Filter to only new criteria
    const newCriteria = applicableCriteria.filter((c) => !existingCriterionIds.has(c.id));

    if (newCriteria.length === 0) {
        console.log(`No new criteria to insert for epic ${epicId} (all applicable criteria already exist)`);
        return;
    }

    // Resolve decision owners for new criteria
    const decisionOwnerMap = await resolveDecisionOwnersForCriteria(
        epicId,
        newCriteria,
        epic.pod,
        sb
    );

    // Default accountable: epic owner (or Aha assigned user) when criterion has no decision_owner_email
    const epicAha = epic?.aha_fields as { standard_fields?: { assigned_to_user?: { email?: string } } } | undefined;
    const epicOwnerEmail = epic?.owner_email || epicAha?.standard_fields?.assigned_to_user?.email || null;
    let defaultOwnerId: string | null = null;
    if (epicOwnerEmail && epicOwnerEmail.includes('@')) {
        const { data: defaultUser } = await sb
            .from('app_user')
            .select('id')
            .eq('email', epicOwnerEmail)
            .single();
        if (defaultUser?.id) defaultOwnerId = defaultUser.id;
    }

    const anchor = await fetchAnchorLaunchDateForEpic(sb, epic);
    const { data: allStagesForDue, error: stagesDueErr } = await sb
        .from('release_stages')
        .select('id, name, sort_order, duration_days, level_durations, scope')
        .order('sort_order', { ascending: true });

    if (stagesDueErr || !allStagesForDue?.length) {
        console.warn('instantiateReleaseCriteriaForEpic: release_stages fetch failed or empty', stagesDueErr);
    }

    const dueDateMap = new Map<string, string | null>();
    for (const c of newCriteria) {
        const dueDate = computeCriterionDueDateYmd({
            anchorYmd: anchor,
            ratingTimingId: c.rating_timing,
            allStages: allStagesForDue ?? [],
            uiLevel: isUiFrameworkEpic ? uiLevel : undefined,
        });
        dueDateMap.set(c.id, dueDate);
    }

    // AI Pruning Suggestion (Human-in-the-Loop), gated by feature flag
    let aiSuggestions: Array<{ id: string; reason: string }> = [];
    const featureFlags = await getFeatureFlags();
    if (isEnabled(FEATURE_AI_PRUNING, featureFlags)) {
        try {
            const { data: epicFull } = await sb
                .from('epic')
                .select('name, description, tags')
                .eq('id', epicId)
                .single();

            if (epicFull) {
                aiSuggestions = await pruneCriteria(
                    epicFull.name,
                    epicFull.description || '',
                    epicFull.tags || [],
                    newCriteria.map(c => ({
                        id: c.id,
                        label: c.label,
                        description: (c as any).description || ''
                    }))
                );
                console.log(`🤖 AI suggested pruning ${aiSuggestions.length} criteria for epic ${epicId}`);
            }
        } catch (aiError) {
            console.warn('AI pruning suggestion failed (skipping):', aiError);
        }
    }

    const aiSuggestionMap = new Map(aiSuggestions.map(s => [s.id, s.reason]));

    // Create epic_criterion_status records for new criteria only
    const newRecords = newCriteria.map((c) => {
        const record: any = {
            epic_id: epicId,
            criterion_id: c.id,
            status: 'NOT_SET',
            last_updated_at: new Date().toISOString(),
        };

        // Set AI pruning suggestion
        if (aiSuggestionMap.has(c.id)) {
            record.ai_prune_suggested = true;
            record.ai_prune_reason = aiSuggestionMap.get(c.id);
        }

        // Set decision_owner_id: resolved from template/pod, or default to epic owner
        const decisionOwnerId = decisionOwnerMap.get(c.id) ?? defaultOwnerId;
        if (decisionOwnerId) {
            record.decision_owner_id = decisionOwnerId;
        }

        // Set condition_due_date if calculated
        const dueDate = dueDateMap.get(c.id);
        if (dueDate) {
            record.condition_due_date = dueDate;
        }

        return record;
    });

    console.log(`Inserting ${newRecords.length} new criteria records for epic ${epicId}`);
    const { error: insertError, data: insertedRecords } = await sb
        .from('epic_criterion_status')
        .insert(newRecords)
        .select('id');

    if (insertError) {
        const isDuplicateKey = insertError.code === '23505'
            || insertError.message?.includes('uq_launch_criterion_status')
            || insertError.message?.includes('duplicate key');
        if (isDuplicateKey) {
            console.warn(`Criteria already exist for epic ${epicId} (duplicate key), skipping insert`);
            return;
        }
        console.error('Error inserting criteria:', insertError);
        throw new Error(`Failed to insert criteria: ${insertError.message}`);
    }
    console.log(`Successfully instantiated ${newRecords.length} criteria for epic ${epicId}`);

    // Send assignment notifications for newly created criteria
    if (insertedRecords && insertedRecords.length > 0) {
        const newCriterionIds = insertedRecords.map((r) => r.id);
        try {
            await sendCriteriaAssignmentNotifications(epicId, newCriterionIds, sb);
        } catch (notificationError) {
            // Log error but don't fail the instantiation
            console.error('Failed to send assignment notifications:', notificationError);
        }
    }
}

/**
 * Recalculate due dates for all criteria for an epic
 * This is useful when the epic's target_launch_date changes
 */
export async function recalculateDueDatesForEpic(
    epicId: string,
    client?: SupabaseClient
): Promise<void> {
    const sb = client ?? supabase;

    const { data: epic, error: epicError } = await sb
        .from('epic')
        .select('id, target_launch_date, aha_fields')
        .eq('id', epicId)
        .single();

    if (epicError) {
        console.error('Error fetching epic:', epicError);
        throw new Error(`Failed to fetch epic: ${epicError.message}`);
    }

    if (!epic) {
        throw new Error(`Epic ${epicId} not found`);
    }

    const { isUiFramework: isUiFrameworkEpic, uiLevel } = getUiFrameworkDueDateOptions(epic?.aha_fields);
    const anchor = await fetchAnchorLaunchDateForEpic(sb, epic);

    const { data: allStagesForRecalc, error: stagesRecalcErr } = await sb
        .from('release_stages')
        .select('id, name, sort_order, duration_days, level_durations, scope')
        .order('sort_order', { ascending: true });

    if (stagesRecalcErr || !allStagesForRecalc?.length) {
        console.error('recalculateDueDatesForEpic: failed to load release_stages', stagesRecalcErr);
        throw new Error(
            `Failed to fetch release stages for due date recalculation: ${stagesRecalcErr?.message ?? 'empty'}`
        );
    }

    // Get all criteria statuses for this epic with their criterion info (rating_timing)
    const { data: criteriaStatuses, error: criteriaError } = await sb
        .from('epic_criterion_status')
        .select(`
            id,
            criterion_id,
            criterion:criterion_id (
                rating_timing
            )
        `)
        .eq('epic_id', epicId);

    if (criteriaError) {
        console.error('Error fetching criteria statuses:', criteriaError);
        throw new Error(`Failed to fetch criteria statuses: ${criteriaError.message}`);
    }

    if (!criteriaStatuses || criteriaStatuses.length === 0) {
        console.log(`No criteria found for epic ${epicId}, skipping due date recalculation`);
        return;
    }

    // Calculate new due dates for all criteria
    const updates: Array<{ id: string; condition_due_date: string | null }> = [];
    
    for (const status of criteriaStatuses) {
        const criterion = status.criterion as any;
        const ratingTimingId = criterion?.rating_timing;

        const dueDate = computeCriterionDueDateYmd({
            anchorYmd: anchor,
            ratingTimingId,
            allStages: allStagesForRecalc,
            uiLevel: isUiFrameworkEpic ? uiLevel : undefined,
        });

        updates.push({
            id: status.id,
            condition_due_date: dueDate,
        });
    }

    // Batch update all due dates using parallel updates for better performance
    if (updates.length > 0) {
        // Update in parallel batches to improve performance
        const batchSize = 50; // Smaller batches for parallel processing
        const batches: Array<Array<{ id: string; condition_due_date: string | null }>> = [];
        
        for (let i = 0; i < updates.length; i += batchSize) {
            batches.push(updates.slice(i, i + batchSize));
        }
        
        // Process batches sequentially, but updates within each batch in parallel
        for (const batch of batches) {
            const updatePromises = batch.map(async (update) => {
                const { error: updateError } = await sb
                    .from('epic_criterion_status')
                    .update({ condition_due_date: update.condition_due_date })
                    .eq('id', update.id);
                
                if (updateError) {
                    console.error(`Failed to update due date for criterion status ${update.id}:`, updateError);
                    return { success: false, id: update.id };
                }
                return { success: true, id: update.id };
            });
            
            // Wait for all updates in this batch to complete
            const results = await Promise.all(updatePromises);
            const failed = results.filter(r => !r.success).length;
            if (failed > 0) {
                console.warn(`Failed to update ${failed} out of ${batch.length} criteria in batch`);
            }
        }
        
        console.log(`Recalculated due dates for ${updates.length} criteria for epic ${epicId}`);
    }
}

/**
 * Cascade a release date change to all epics in that release.
 * Updates each epic's target_launch_date and recalculates all criteria due dates.
 * Call this whenever a release_schedule.launch_date is modified.
 */
export async function cascadeReleaseDateToEpics(
    releaseName: string,
    newLaunchDate: string,
    client?: SupabaseClient
): Promise<{ updated: number; errors: string[] }> {
    const sb = client ?? supabase;
    const result = { updated: 0, errors: [] as string[] };

    // Find all non-archived epics whose aha_fields->standard_fields->aha_release_name matches
    const { data: epics, error: queryError } = await sb
        .from('epic')
        .select('id, name, aha_id, target_launch_date')
        .or(
            `aha_fields->standard_fields->>aha_release_name.eq.${releaseName},aha_fields->standard_fields->release->>name.eq.${releaseName}`
        )
        .eq('archived', false);

    if (queryError) {
        console.error('Error querying epics for release cascade:', queryError);
        throw new Error(`Failed to query epics for release "${releaseName}": ${queryError.message}`);
    }

    if (!epics || epics.length === 0) {
        console.log(`No active epics found for release "${releaseName}", skipping cascade`);
        return result;
    }

    console.log(`📅 Cascading release date change for "${releaseName}" (${newLaunchDate}) to ${epics.length} epics`);

    for (const epic of epics) {
        try {
            // Update the epic's target_launch_date if it changed
            if (epic.target_launch_date !== newLaunchDate) {
                const { error: updateError } = await sb
                    .from('epic')
                    .update({ target_launch_date: newLaunchDate, updated_at: new Date().toISOString() })
                    .eq('id', epic.id);

                if (updateError) {
                    const msg = `Failed to update target_launch_date for epic ${epic.id} (${epic.aha_id}): ${updateError.message}`;
                    console.error(msg);
                    result.errors.push(msg);
                    continue;
                }
            }

            // Recalculate all criteria due dates for this epic
            await recalculateDueDatesForEpic(epic.id, sb);
            result.updated++;
            console.log(`  ✅ Updated epic: ${epic.name} (${epic.aha_id})`);
        } catch (err) {
            const msg = `Failed to cascade date for epic ${epic.id} (${epic.aha_id}): ${(err as Error).message}`;
            console.error(msg);
            result.errors.push(msg);
        }
    }

    console.log(`📅 Release date cascade complete: ${result.updated}/${epics.length} epics updated, ${result.errors.length} errors`);
    return result;
}

/**
 * Send grouped Slack notifications for newly assigned criteria
 */
export async function sendCriteriaAssignmentNotifications(
    epicId: string,
    criterionStatusIds: string[],
    client?: SupabaseClient
): Promise<void> {
    if (criterionStatusIds.length === 0) {
        return;
    }

    const sb = client ?? supabase;
    const { getSettings } = await import('../settings-db');
    const { groupCriteriaByEpicAndAssignee } = await import('../slack/notification-groups');
    const { buildCriteriaAssignmentMessage } = await import('../slack/templates');
    const { sendSlackNotification, canReceiveSlackNotification } = await import('../slack/notifications');

    // Query newly created criteria with decision owner and epic info
    const { data: criteriaStatuses, error: queryError } = await sb
        .from('epic_criterion_status')
        .select(
            `
            id,
            epic_id,
            criterion_id,
            decision_owner_id,
            condition_due_date,
            status,
            criterion:criterion_id (
                label,
                category
            ),
            epic:epic_id (
                name
            ),
            decision_owner:decision_owner_id (
                id,
                email,
                first_name,
                last_name,
                slack_handle
            )
        `
        )
        .in('id', criterionStatusIds)
        .not('decision_owner_id', 'is', null);

    if (queryError) {
        console.error('Error querying criteria for notifications:', queryError);
        throw new Error(`Failed to query criteria: ${queryError.message}`);
    }

    if (!criteriaStatuses || criteriaStatuses.length === 0) {
        console.log('No criteria with decision owners found for notifications');
        return;
    }

    // Log all notifications before filtering
    const notificationsByEmail = new Map<string, any[]>();
    for (const cs of criteriaStatuses) {
        const decisionOwner = Array.isArray(cs.decision_owner) && cs.decision_owner.length > 0
            ? cs.decision_owner[0]
            : (cs.decision_owner as any);
        const ownerEmail = decisionOwner?.email?.toLowerCase() || 'unknown';
        if (!notificationsByEmail.has(ownerEmail)) {
            notificationsByEmail.set(ownerEmail, []);
        }
        const criterion = Array.isArray(cs.criterion) && cs.criterion.length > 0
            ? cs.criterion[0]
            : (cs.criterion as any);
        const epic = Array.isArray(cs.epic) && cs.epic.length > 0
            ? cs.epic[0]
            : (cs.epic as any);
        notificationsByEmail.get(ownerEmail)!.push({
            criterion_id: cs.criterion_id,
            criterion_label: criterion?.label,
            epic_name: epic?.name,
            assignee_email: ownerEmail,
            assignee_name: `${decisionOwner?.first_name || ''} ${decisionOwner?.last_name || ''}`.trim() || ownerEmail,
            has_slack_handle: !!decisionOwner?.slack_handle,
        });
    }

    const uniqueEmails = Array.from(notificationsByEmail.keys()).filter(e => e !== 'unknown');
    const allowedForSlack = new Set<string>();
    for (const email of uniqueEmails) {
        if (await canReceiveSlackNotification(email)) allowedForSlack.add(email);
    }

    console.log('📋 Slack Assignment Notifications - ALL NOTIFICATIONS (before filtering):');
    console.log(`   Total criteria with assignees: ${criteriaStatuses.length}`);
    console.log(`   Slack recipients: per-user flag in User Management (${allowedForSlack.size} user(s) enabled)`);
    for (const [email, criteria] of notificationsByEmail.entries()) {
        const firstCriterion = criteriaStatuses.find((cs: any) => {
            const decisionOwner = Array.isArray(cs.decision_owner) && cs.decision_owner.length > 0
                ? cs.decision_owner[0]
                : (cs.decision_owner as any);
            return decisionOwner?.email?.toLowerCase() === email;
        });
        const decisionOwner = firstCriterion ? (Array.isArray(firstCriterion.decision_owner) && firstCriterion.decision_owner.length > 0
            ? firstCriterion.decision_owner[0]
            : (firstCriterion.decision_owner as any)) : null;
        const slackHandle = decisionOwner?.slack_handle;
        const willSend = allowedForSlack.has(email);
        const status = willSend ? '✅ WILL SEND' : '📝 LOGGED ONLY';
        console.log(`   ${status} - ${email} (Slack: ${slackHandle || 'none'}): ${criteria.length} criteria`);
        if (criteria.length <= 5) {
            criteria.forEach((c) => {
                console.log(`      - ${c.criterion_label} (${c.epic_name})`);
            });
        } else {
            console.log(`      ... ${criteria.length} criteria (showing first 3)`);
            criteria.slice(0, 3).forEach((c) => {
                console.log(`      - ${c.criterion_label} (${c.epic_name})`);
            });
        }
    }

    const filteredCriteria = criteriaStatuses.filter((cs: any) => {
        const decisionOwner = Array.isArray(cs.decision_owner) && cs.decision_owner.length > 0
            ? cs.decision_owner[0]
            : (cs.decision_owner as any);
        const ownerEmail = decisionOwner?.email?.toLowerCase();
        return ownerEmail && allowedForSlack.has(ownerEmail);
    });

    if (filteredCriteria.length === 0) {
        console.log('⏭️  No assignees have Slack notifications enabled in User Management (all notifications logged above)');
        return;
    }

    console.log(`✅ Sending notifications to ${filteredCriteria.length} criteria (${criteriaStatuses.length} total were logged)`);

    // Group by epic and assignee
    const grouped = groupCriteriaByEpicAndAssignee(filteredCriteria as any);

    // Send notifications for each group
    for (const [key, group] of grouped.entries()) {
        if (!group.assignee_slack_handle) {
            // Try to sync Slack handle before skipping
            console.log(`Attempting to sync Slack handle for ${group.assignee_email}...`);
            const syncedHandle = await syncUserSlackHandle(group.assignee_email);

            if (syncedHandle) {
                // Update the group with the synced handle
                group.assignee_slack_handle = syncedHandle;
                console.log(`Successfully synced Slack handle for ${group.assignee_email}: ${syncedHandle}`);
            } else {
                console.log(`Skipping notification for ${group.assignee_email} - no Slack handle found`);
                continue;
            }
        }

        try {
            const message = buildCriteriaAssignmentMessage(group);
            const epicUrl = process.env.NEXT_PUBLIC_APP_URL
                ? `${process.env.NEXT_PUBLIC_APP_URL}/epics/${group.epic_id}`
                : undefined;

            await sendSlackNotification({
                type: 'criteria_assignment',
                priority: 'medium',
                recipient: {
                    id: group.assignee_id,
                    email: group.assignee_email,
                    slack_handle: group.assignee_slack_handle,
                    name: group.assignee_name,
                },
                launch_id: group.epic_id,
                metadata: {
                    epic_name: group.epic_name,
                    epic_id: group.epic_id,
                    criteria_count: group.criteria.length,
                    criteria: group.criteria.map((c) => ({
                        id: c.id,
                        label: c.label,
                        category: c.category,
                        due_date: c.due_date,
                    })),
                    epic_url: epicUrl,
                },
            });

            console.log(
                `Sent assignment notification to ${group.assignee_email} for ${group.criteria.length} criteria in ${group.epic_name}`
            );
        } catch (error: any) {
            console.error(`Failed to send notification to ${group.assignee_email}:`, error);
            // Continue with other groups
        }
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

/**
 * Fetches a release from Aha API by name and upserts it into release_schedule table
 * @param releaseName The name of the release to fetch
 * @returns The launch_date (end_date or start_date) or null if not found or has no date
 */
export async function fetchAndUpsertReleaseFromAha(releaseName: string): Promise<string | null> {
    try {
        console.log(`🔄 Auto-fetching release "${releaseName}" from Aha API...`);

        // Fetch all releases from Aha (paginated) to find the one matching by name
        let page = 1;
        const perPage = 50;
        let hasMore = true;

        while (hasMore) {
            const response = await getReleases({ per_page: perPage, page });
            const releases = response.releases || [];

            // Look for exact match first, then case-insensitive match
            let matchedRelease = releases.find((r: any) => r.name === releaseName);
            if (!matchedRelease) {
                matchedRelease = releases.find((r: any) =>
                    r.name?.toLowerCase() === releaseName.toLowerCase()
                );
            }

            if (matchedRelease) {
                // Extract launch_date from end_date or start_date
                const launchDate = matchedRelease.end_date || matchedRelease.start_date || null;

                // Upsert into release_schedule table
                const { error } = await supabase
                    .from('release_schedule')
                    .upsert(
                        {
                            release_name: matchedRelease.name,
                            launch_date: launchDate,
                            updated_at: new Date().toISOString(),
                        },
                        {
                            onConflict: 'release_name',
                        }
                    );

                if (error) {
                    console.error(`Error upserting release ${matchedRelease.name}:`, error);
                    throw error;
                }

                if (launchDate) {
                    console.log(`✅ Fetched release "${releaseName}" with date: ${launchDate}`);
                } else {
                    console.warn(`⚠️ Release "${releaseName}" found in Aha but has no date`);
                }

                return launchDate;
            }

            hasMore = releases.length === perPage;
            page++;
        }

        // Release not found in Aha
        console.warn(`⚠️ Release "${releaseName}" not found in Aha API`);
        return null;

    } catch (error) {
        console.error(`Error fetching release "${releaseName}" from Aha:`, error);
        throw error;
    }
}

