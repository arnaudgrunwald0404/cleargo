import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MappedEpicData } from '../aha/mapping';
import { getReleases } from '../aha/client';
import { syncUserSlackHandle } from '../slack/notifications';
import { pruneCriteria } from '../ai/client';
import { isEnabled, FEATURE_AI_PRUNING } from '../flags';

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

/**
 * Extract cleargo_candidate value from epic data
 * Returns true if cleargo_candidate is "Yes" or true, false otherwise
 */
function getClearGOCandidateValue(epicData: MappedEpicData): boolean {
    const ahaFields = epicData.aha_fields;
    if (!ahaFields || typeof ahaFields !== 'object') {
        return false;
    }

    const customFields = ahaFields.custom_fields;
    if (!customFields || typeof customFields !== 'object') {
        return false;
    }

    const cleargoCandidate = customFields.cleargo_candidate;

    if (cleargoCandidate === null || cleargoCandidate === undefined) {
        return false;
    }

    // Check if value is "Yes" or true
    return cleargoCandidate === 'Yes' || cleargoCandidate === true;
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

    // Only set console_url for new epics
    if (!existing) {
        upsertData.status = 'PLANNED';
    }

    // Determine archived status based on cleargo_candidate field
    // Archive if cleargo_candidate is not "Yes", unarchive if it is "Yes"
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
 * Calculate due date based on target launch date and rating timing (launch stage)
 */
async function calculateDueDateForCriterion(
    targetLaunchDate: string | null,
    ratingTimingId: number | null,
    client: SupabaseClient
): Promise<string | null> {
    if (!targetLaunchDate || !ratingTimingId) {
        return null;
    }

    // Fetch all launch stages
    const { data: launchStages, error: stagesError } = await client
        .from('launch_stages')
        .select('id, sort_order, duration_days')
        .order('sort_order', { ascending: true });

    if (stagesError || !launchStages || launchStages.length === 0) {
        console.warn('Failed to fetch launch stages for due date calculation:', stagesError);
        return null;
    }

    // Find the target stage
    const targetStage = launchStages.find((s) => s.id === ratingTimingId);
    if (!targetStage) {
        return null;
    }

    // Find the last pre-launch stage (Internal Readiness, sort_order 3)
    // This is the stage before launch, so we sum durations up to this stage
    const lastPreLaunchStage = launchStages.find((s) => s.sort_order === 3);
    if (!lastPreLaunchStage) {
        return null;
    }

    // Sum durations of all stages before the target stage
    // Only include pre-launch stages (up to Internal Readiness)
    const stagesBeforeTarget = launchStages.filter(
        (s) =>
            s.sort_order < targetStage.sort_order &&
            s.sort_order <= lastPreLaunchStage.sort_order &&
            s.duration_days !== null
    );

    const totalDaysBefore = stagesBeforeTarget.reduce((sum, s) => sum + (s.duration_days || 0), 0);

    if (totalDaysBefore === 0) {
        return null;
    }

    // Calculate due date: subtract days before launch from target date
    const targetDate = new Date(targetLaunchDate);
    const dueDate = new Date(targetDate);
    dueDate.setDate(dueDate.getDate() - totalDaysBefore);

    return dueDate.toISOString().split('T')[0]; // Return as YYYY-MM-DD
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

    // Get epic info (for target_launch_date and pod)
    const { data: epic, error: epicError } = await sb
        .from('epic')
        .select('id, target_launch_date, pod')
        .eq('id', epicId)
        .single();

    if (epicError) {
        console.error('Error fetching epic:', epicError);
        throw new Error(`Failed to fetch epic: ${epicError.message}`);
    }

    // Get all active criteria applicable to this tier (with decision_owner_email and rating_timing)
    const { data: criteria, error: criteriaError } = await sb
        .from('criterion')
        .select('id, label, description, tier_applicability, decision_owner_email, rating_timing')
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
        if (c.tier_applicability === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2')) return true;
        // For TIER_3, only ALL criteria apply (already handled above)
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

    // Calculate due dates for new criteria
    const dueDatePromises = newCriteria.map(async (c) => {
        const dueDate = await calculateDueDateForCriterion(
            epic.target_launch_date,
            c.rating_timing,
            sb
        );
        return { criterionId: c.id, dueDate };
    });
    const dueDateResults = await Promise.all(dueDatePromises);
    const dueDateMap = new Map(dueDateResults.map((r) => [r.criterionId, r.dueDate]));

    // AI Pruning Suggestion (Human-in-the-Loop), gated by feature flag
    let aiSuggestions: Array<{ id: string; reason: string }> = [];
    if (isEnabled(FEATURE_AI_PRUNING)) {
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

        // Set decision_owner_id if resolved
        const decisionOwnerId = decisionOwnerMap.get(c.id);
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
    const { sendSlackNotification } = await import('../slack/notifications');

    // Get test filters from settings
    // We filter by email address for both email and Slack notifications
    // All notifications are logged, but only matching emails receive actual notifications
    // Support multiple emails (comma or newline separated)
    const settings = await getSettings();
    const testEmailRaw = settings.slack_notification_test_email?.trim() || 'agrunwald@clearcompany.com';
    const testEmails = testEmailRaw
        .split(/[,\n]/)
        .map(email => email.trim())
        .filter(email => email.length > 0)
        .map(email => email.toLowerCase());
    const testSlackHandle = settings.slack_notification_test_slack_handle?.trim() || null;
    const useTestEmailFilter = testEmails.length > 0;
    const useTestSlackFilter = testSlackHandle && testSlackHandle.length > 0;

    // Helper function to check if an email matches the filter
    const isEmailInFilter = (email: string): boolean => {
        if (!useTestEmailFilter) return true;
        return testEmails.includes(email.toLowerCase());
    };

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

    console.log('📋 Slack Assignment Notifications - ALL NOTIFICATIONS (before filtering):');
    console.log(`   Total criteria with assignees: ${criteriaStatuses.length}`);
    if (useTestSlackFilter) {
        console.log(`   Test Slack handle filter: ${testSlackHandle} (only matching Slack handles will receive notifications)`);
    } else {
        console.log(`   Test email filter: ${useTestEmailFilter ? testEmails.join(', ') : 'DISABLED (sending to all)'}`);
    }
    console.log('   Breakdown by assignee (all will be logged, only filtered users will receive notifications):');
    for (const [email, criteria] of notificationsByEmail.entries()) {
        // Find Slack handle for this email
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
        let willSend = false;
        if (useTestSlackFilter) {
            willSend = slackHandle && slackHandle === testSlackHandle;
        } else if (useTestEmailFilter) {
            willSend = isEmailInFilter(email);
        } else {
            willSend = true; // No filter, send to all
        }
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

    // Filter by test email or Slack handle - only send to matching users, but all are logged above
    const filteredCriteria = (useTestEmailFilter || useTestSlackFilter)
        ? criteriaStatuses.filter((cs: any) => {
            const decisionOwner = Array.isArray(cs.decision_owner) && cs.decision_owner.length > 0
                ? cs.decision_owner[0]
                : (cs.decision_owner as any);
            const ownerEmail = decisionOwner?.email?.toLowerCase();
            const slackHandle = decisionOwner?.slack_handle;

            // If Slack handle filter is set, use it; otherwise use email filter
            if (useTestSlackFilter) {
                return slackHandle && slackHandle === testSlackHandle;
            } else if (useTestEmailFilter) {
                return isEmailInFilter(ownerEmail || '');
            }
            return false;
        })
        : criteriaStatuses;

    if (filteredCriteria.length === 0) {
        console.log(`⏭️  No criteria match test email filter: ${testEmails.join(', ')} (but all notifications were logged above)`);
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

