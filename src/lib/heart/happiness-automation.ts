/**
 * Happiness Automation Service
 * 
 * Manages the "Happiness" automation framework for HEART metrics.
 * 
 * The vision:
 * 1. Define a segment of users a feature is intended for
 * 2. Identify users in that segment who aren't using the feature
 * 3. Trigger automated actions (Pendo guides, CSM nudges, etc.)
 * 4. Track the effectiveness of these interventions
 */

import { getAdminClient } from '@/lib/db';
import { PendoClient } from '@/lib/integrations/pendo/client';
import type {
  HappinessAutomationRule,
  HappinessTargetAudienceMember,
  HappinessActionExecution,
  HappinessCsmNudge,
  HappinessAutomationMetrics,
  CreateHappinessAutomationRuleDTO,
  UpdateHappinessAutomationRuleDTO,
  HappinessAutomationRuleDisplay,
  HappinessDashboardSummary,
  SegmentNonUsageTriggerConfig,
  CsmNotificationActionConfig,
} from './types';

const getDbClient = () => getAdminClient();

// ============================================================================
// Pendo Client Helper
// ============================================================================

async function getPendoClient(): Promise<PendoClient | null> {
  const supabase = getDbClient();
  
  const { data: integration } = await supabase
    .from('pendo_integrations')
    .select('*')
    .eq('status', 'connected')
    .single();
  
  if (!integration) {
    console.warn('[HappinessAutomation] No connected Pendo integration found');
    return null;
  }
  
  return new PendoClient({
    apiKey: integration.api_key_encrypted, // TODO: decrypt
    environment: integration.environment,
  });
}

// ============================================================================
// CRUD Operations for Automation Rules
// ============================================================================

/**
 * Create a new happiness automation rule
 */
export async function createAutomationRule(
  dto: CreateHappinessAutomationRuleDTO,
  createdBy: string
): Promise<HappinessAutomationRule> {
  const supabase = getDbClient();
  
  const { data, error } = await supabase
    .from('happiness_automation_rules')
    .insert({
      epic_heart_metric_id: dto.epic_heart_metric_id || null,
      epic_id: dto.epic_id || null,
      name: dto.name,
      description: dto.description || null,
      trigger_type: dto.trigger_type,
      trigger_config: dto.trigger_config,
      action_type: dto.action_type,
      action_config: dto.action_config,
      is_recurring: dto.is_recurring || false,
      recurrence_interval_days: dto.recurrence_interval_days || null,
      max_executions_per_user: dto.max_executions_per_user || 1,
      cooldown_days: dto.cooldown_days || 7,
      created_by: createdBy,
      status: 'draft',
    })
    .select()
    .single();
  
  if (error) {
    console.error('[HappinessAutomation] Error creating rule:', error);
    throw new Error(`Failed to create automation rule: ${error.message}`);
  }
  
  return data as HappinessAutomationRule;
}

/**
 * Get an automation rule by ID
 */
export async function getAutomationRule(
  ruleId: string
): Promise<HappinessAutomationRuleDisplay | null> {
  const supabase = getDbClient();
  
  const { data, error } = await supabase
    .from('happiness_automation_rules')
    .select(`
      *,
      epic:epic_id (name),
      heart_metric:epic_heart_metric_id (name)
    `)
    .eq('id', ruleId)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  // Get audience count
  const { count: audienceCount } = await supabase
    .from('happiness_target_audiences')
    .select('*', { count: 'exact', head: true })
    .eq('rule_id', ruleId);
  
  // Get last execution
  const { data: lastExecution } = await supabase
    .from('happiness_action_executions')
    .select('*')
    .eq('rule_id', ruleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  return {
    ...data,
    epic_name: (data.epic as any)?.name,
    heart_metric_name: (data.heart_metric as any)?.name,
    audience_count: audienceCount || 0,
    last_execution: lastExecution || null,
  } as HappinessAutomationRuleDisplay;
}

/**
 * List automation rules with optional filters
 */
export async function listAutomationRules(filters?: {
  epicId?: string;
  metricId?: string;
  status?: string;
  triggerType?: string;
}): Promise<HappinessAutomationRuleDisplay[]> {
  const supabase = getDbClient();
  
  let query = supabase
    .from('happiness_automation_rules')
    .select(`
      *,
      epic:epic_id (name),
      heart_metric:epic_heart_metric_id (name)
    `)
    .order('created_at', { ascending: false });
  
  if (filters?.epicId) {
    query = query.eq('epic_id', filters.epicId);
  }
  if (filters?.metricId) {
    query = query.eq('epic_heart_metric_id', filters.metricId);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.triggerType) {
    query = query.eq('trigger_type', filters.triggerType);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[HappinessAutomation] Error listing rules:', error);
    return [];
  }
  
  return (data || []).map(rule => ({
    ...rule,
    epic_name: (rule.epic as any)?.name,
    heart_metric_name: (rule.heart_metric as any)?.name,
  })) as HappinessAutomationRuleDisplay[];
}

/**
 * Update an automation rule
 */
export async function updateAutomationRule(
  ruleId: string,
  dto: UpdateHappinessAutomationRuleDTO
): Promise<HappinessAutomationRule> {
  const supabase = getDbClient();
  
  const { data, error } = await supabase
    .from('happiness_automation_rules')
    .update({
      ...dto,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ruleId)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to update automation rule: ${error.message}`);
  }
  
  return data as HappinessAutomationRule;
}

/**
 * Delete an automation rule
 */
export async function deleteAutomationRule(ruleId: string): Promise<void> {
  const supabase = getDbClient();
  
  const { error } = await supabase
    .from('happiness_automation_rules')
    .delete()
    .eq('id', ruleId);
  
  if (error) {
    throw new Error(`Failed to delete automation rule: ${error.message}`);
  }
}

// ============================================================================
// Automation Rule Lifecycle
// ============================================================================

/**
 * Activate an automation rule
 */
export async function activateRule(
  ruleId: string,
  approvedBy: string
): Promise<HappinessAutomationRule> {
  return updateAutomationRule(ruleId, {
    status: 'active',
  });
}

/**
 * Pause an automation rule
 */
export async function pauseRule(ruleId: string): Promise<HappinessAutomationRule> {
  return updateAutomationRule(ruleId, {
    status: 'paused',
  });
}

// ============================================================================
// Target Audience Management
// ============================================================================

/**
 * Evaluate a rule's trigger and compute the target audience
 * This is the core function that identifies users who should receive an action
 */
export async function evaluateRuleTrigger(
  ruleId: string
): Promise<HappinessTargetAudienceMember[]> {
  const supabase = getDbClient();
  
  // Get the rule
  const rule = await getAutomationRule(ruleId);
  if (!rule) {
    throw new Error('Rule not found');
  }
  
  if (rule.trigger_type !== 'segment_non_usage') {
    // TODO: Implement other trigger types
    console.log(`[HappinessAutomation] Trigger type ${rule.trigger_type} not yet implemented`);
    return [];
  }
  
  const triggerConfig = rule.trigger_config as SegmentNonUsageTriggerConfig;
  
  // Get Pendo client
  const pendoClient = await getPendoClient();
  if (!pendoClient) {
    throw new Error('Pendo integration not connected');
  }
  
  // Calculate date range
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(
    Date.now() - triggerConfig.lookback_days * 24 * 60 * 60 * 1000
  ).toISOString().split('T')[0];
  
  // Get non-users from Pendo
  let nonUsers: Array<{ visitorId: string; accountId?: string }> = [];
  
  if (triggerConfig.feature_id) {
    // Feature-based trigger
    nonUsers = await pendoClient.getSegmentNonUsers({
      segmentId: triggerConfig.segment_id,
      featureId: triggerConfig.feature_id,
      startDate,
      endDate,
    });
  } else if (triggerConfig.event_ids && triggerConfig.event_ids.length > 0) {
    // Event-based trigger (would need similar implementation)
    // TODO: Implement event-based non-user detection
    console.log('[HappinessAutomation] Event-based triggers not yet implemented');
  }
  
  // Check minimum segment size
  if (triggerConfig.min_segment_size && nonUsers.length < triggerConfig.min_segment_size) {
    console.log(
      `[HappinessAutomation] Segment size ${nonUsers.length} below minimum ${triggerConfig.min_segment_size}`
    );
    return [];
  }
  
  // Store/update target audience
  const audienceMembers: HappinessTargetAudienceMember[] = [];
  
  for (const nonUser of nonUsers) {
    const { data, error } = await supabase
      .from('happiness_target_audiences')
      .upsert({
        rule_id: ruleId,
        pendo_visitor_id: nonUser.visitorId,
        pendo_account_id: nonUser.accountId || null,
        computed_at: new Date().toISOString(),
      }, {
        onConflict: 'rule_id,pendo_visitor_id',
      })
      .select()
      .single();
    
    if (data) {
      audienceMembers.push(data as HappinessTargetAudienceMember);
    }
  }
  
  // Update rule's last_evaluated_at
  await supabase
    .from('happiness_automation_rules')
    .update({ last_evaluated_at: new Date().toISOString() })
    .eq('id', ruleId);
  
  console.log(
    `[HappinessAutomation] Rule ${ruleId}: found ${audienceMembers.length} non-users in segment`
  );
  
  return audienceMembers;
}

/**
 * Get the current target audience for a rule
 */
export async function getTargetAudience(
  ruleId: string,
  options?: { onlyUnactioned?: boolean; limit?: number }
): Promise<HappinessTargetAudienceMember[]> {
  const supabase = getDbClient();
  
  let query = supabase
    .from('happiness_target_audiences')
    .select('*')
    .eq('rule_id', ruleId)
    .order('computed_at', { ascending: false });
  
  if (options?.onlyUnactioned) {
    query = query.eq('has_been_actioned', false);
  }
  
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[HappinessAutomation] Error fetching audience:', error);
    return [];
  }
  
  return (data || []) as HappinessTargetAudienceMember[];
}

// ============================================================================
// Action Execution
// ============================================================================

/**
 * Execute an action for a rule
 * This is where we actually trigger guides, send notifications, etc.
 */
export async function executeAction(
  ruleId: string,
  targetAudienceIds?: string[]
): Promise<HappinessActionExecution[]> {
  const supabase = getDbClient();
  
  const rule = await getAutomationRule(ruleId);
  if (!rule) {
    throw new Error('Rule not found');
  }
  
  // Get target audience members to action
  let audience: HappinessTargetAudienceMember[];
  if (targetAudienceIds) {
    const { data } = await supabase
      .from('happiness_target_audiences')
      .select('*')
      .in('id', targetAudienceIds);
    audience = (data || []) as HappinessTargetAudienceMember[];
  } else {
    audience = await getTargetAudience(ruleId, { onlyUnactioned: true });
  }
  
  if (audience.length === 0) {
    console.log(`[HappinessAutomation] No unactioned audience members for rule ${ruleId}`);
    return [];
  }
  
  const executions: HappinessActionExecution[] = [];
  
  switch (rule.action_type) {
    case 'csm_notification':
      // Create CSM nudges grouped by account
      const nudges = await createCsmNudges(rule, audience);
      
      // Create execution record
      const { data: execution } = await supabase
        .from('happiness_action_executions')
        .insert({
          rule_id: ruleId,
          status: 'completed',
          action_type: rule.action_type,
          action_payload: {
            nudge_count: nudges.length,
            audience_count: audience.length,
          },
          result_data: {
            nudges_created: nudges.map(n => n.id),
          },
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (execution) {
        executions.push(execution as HappinessActionExecution);
      }
      break;
    
    case 'pendo_guide':
      // TODO: Implement Pendo guide activation
      // This would use the Pendo API to activate a guide for specific visitors
      console.log('[HappinessAutomation] Pendo guide action not yet implemented');
      break;
    
    case 'slack_alert':
      // TODO: Implement Slack alerts
      console.log('[HappinessAutomation] Slack alert action not yet implemented');
      break;
    
    default:
      console.log(`[HappinessAutomation] Action type ${rule.action_type} not implemented`);
  }
  
  // Mark audience members as actioned
  if (audience.length > 0) {
    await supabase
      .from('happiness_target_audiences')
      .update({
        has_been_actioned: true,
        actioned_at: new Date().toISOString(),
      })
      .in('id', audience.map(a => a.id));
  }
  
  return executions;
}

/**
 * Create CSM nudges from target audience
 * Groups non-users by account for easier CSM action
 */
async function createCsmNudges(
  rule: HappinessAutomationRuleDisplay,
  audience: HappinessTargetAudienceMember[]
): Promise<HappinessCsmNudge[]> {
  const supabase = getDbClient();
  const actionConfig = rule.action_config as CsmNotificationActionConfig;
  
  // Group audience by account
  const accountGroups = new Map<string, HappinessTargetAudienceMember[]>();
  for (const member of audience) {
    const accountId = member.pendo_account_id || 'unknown';
    if (!accountGroups.has(accountId)) {
      accountGroups.set(accountId, []);
    }
    accountGroups.get(accountId)!.push(member);
  }
  
  const nudges: HappinessCsmNudge[] = [];
  
  for (const [accountId, members] of accountGroups) {
    const triggerConfig = rule.trigger_config as SegmentNonUsageTriggerConfig;
    
    const context = {
      epic_name: rule.epic_name,
      feature_name: triggerConfig.feature_name,
      segment_name: triggerConfig.segment_name,
      non_user_count: members.length,
      suggested_action: actionConfig.suggested_action,
      non_users: actionConfig.include_non_user_list
        ? members.map(m => ({
            visitorId: m.pendo_visitor_id,
            email: m.visitor_email || undefined,
          }))
        : undefined,
    };
    
    const { data, error } = await supabase
      .from('happiness_csm_nudges')
      .insert({
        rule_id: rule.id,
        pendo_account_id: accountId,
        account_name: members[0]?.account_name || null,
        status: 'pending',
        context,
      })
      .select()
      .single();
    
    if (data) {
      nudges.push(data as HappinessCsmNudge);
    }
  }
  
  console.log(
    `[HappinessAutomation] Created ${nudges.length} CSM nudges for ${audience.length} non-users`
  );
  
  return nudges;
}

// ============================================================================
// CSM Nudge Management
// ============================================================================

/**
 * Get pending CSM nudges
 */
export async function getPendingCsmNudges(
  csmEmail?: string
): Promise<HappinessCsmNudge[]> {
  const supabase = getDbClient();
  
  let query = supabase
    .from('happiness_csm_nudges')
    .select('*')
    .in('status', ['pending', 'assigned'])
    .order('created_at', { ascending: false });
  
  if (csmEmail) {
    query = query.or(`assigned_csm_email.eq.${csmEmail},assigned_csm_email.is.null`);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[HappinessAutomation] Error fetching CSM nudges:', error);
    return [];
  }
  
  return (data || []) as HappinessCsmNudge[];
}

/**
 * Assign a nudge to a CSM
 */
export async function assignNudgeToCsm(
  nudgeId: string,
  csmEmail: string
): Promise<HappinessCsmNudge> {
  const supabase = getDbClient();
  
  const { data, error } = await supabase
    .from('happiness_csm_nudges')
    .update({
      assigned_csm_email: csmEmail,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
    })
    .eq('id', nudgeId)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to assign nudge: ${error.message}`);
  }
  
  return data as HappinessCsmNudge;
}

/**
 * Update nudge status (for CSM to mark as contacted/resolved)
 */
export async function updateNudgeStatus(
  nudgeId: string,
  status: HappinessCsmNudge['status'],
  notes?: string
): Promise<HappinessCsmNudge> {
  const supabase = getDbClient();
  
  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  };
  
  if (status === 'contacted') {
    updateData.contacted_at = new Date().toISOString();
    if (notes) updateData.csm_notes = notes;
  } else if (status === 'resolved' || status === 'dismissed') {
    updateData.resolved_at = new Date().toISOString();
    if (notes) updateData.resolution_notes = notes;
  }
  
  const { data, error } = await supabase
    .from('happiness_csm_nudges')
    .update(updateData)
    .eq('id', nudgeId)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to update nudge status: ${error.message}`);
  }
  
  return data as HappinessCsmNudge;
}

// ============================================================================
// Metrics & Dashboard
// ============================================================================

/**
 * Record daily metrics for a rule
 */
export async function recordAutomationMetrics(
  ruleId: string
): Promise<HappinessAutomationMetrics> {
  const supabase = getDbClient();
  const today = new Date().toISOString().split('T')[0];
  
  // Get counts
  const { count: totalInSegment } = await supabase
    .from('happiness_target_audiences')
    .select('*', { count: 'exact', head: true })
    .eq('rule_id', ruleId);
  
  const { count: totalNonUsers } = await supabase
    .from('happiness_target_audiences')
    .select('*', { count: 'exact', head: true })
    .eq('rule_id', ruleId)
    .eq('has_been_actioned', false);
  
  const { count: actionsTriggered } = await supabase
    .from('happiness_action_executions')
    .select('*', { count: 'exact', head: true })
    .eq('rule_id', ruleId)
    .gte('created_at', today);
  
  const { count: actionsCompleted } = await supabase
    .from('happiness_action_executions')
    .select('*', { count: 'exact', head: true })
    .eq('rule_id', ruleId)
    .eq('status', 'completed')
    .gte('created_at', today);
  
  const { count: actionsFailed } = await supabase
    .from('happiness_action_executions')
    .select('*', { count: 'exact', head: true })
    .eq('rule_id', ruleId)
    .eq('status', 'failed')
    .gte('created_at', today);
  
  const { count: conversions } = await supabase
    .from('happiness_target_audiences')
    .select('*', { count: 'exact', head: true })
    .eq('rule_id', ruleId)
    .not('converted_at', 'is', null)
    .gte('converted_at', today);
  
  const conversionRate = actionsCompleted && actionsCompleted > 0
    ? (conversions || 0) / actionsCompleted
    : null;
  
  const { data, error } = await supabase
    .from('happiness_automation_metrics')
    .upsert({
      rule_id: ruleId,
      snapshot_date: today,
      total_in_segment: totalInSegment || 0,
      total_non_users: totalNonUsers || 0,
      actions_triggered: actionsTriggered || 0,
      actions_completed: actionsCompleted || 0,
      actions_failed: actionsFailed || 0,
      conversions: conversions || 0,
      conversion_rate: conversionRate,
    }, {
      onConflict: 'rule_id,snapshot_date',
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to record metrics: ${error.message}`);
  }
  
  return data as HappinessAutomationMetrics;
}

/**
 * Get dashboard summary for happiness automations
 */
export async function getDashboardSummary(): Promise<HappinessDashboardSummary> {
  const supabase = getDbClient();
  
  // Get active rules count
  const { count: activeRules } = await supabase
    .from('happiness_automation_rules')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');
  
  // Get total audience reached
  const { count: totalAudienceReached } = await supabase
    .from('happiness_target_audiences')
    .select('*', { count: 'exact', head: true })
    .eq('has_been_actioned', true);
  
  // Get total conversions
  const { count: totalConversions } = await supabase
    .from('happiness_target_audiences')
    .select('*', { count: 'exact', head: true })
    .not('converted_at', 'is', null);
  
  // Get pending CSM nudges
  const { count: pendingCsmNudges } = await supabase
    .from('happiness_csm_nudges')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'assigned']);
  
  // Get rules by trigger type
  const { data: triggerTypeCounts } = await supabase
    .from('happiness_automation_rules')
    .select('trigger_type')
    .eq('status', 'active');
  
  const rulesByTriggerType: Record<string, number> = {};
  for (const rule of triggerTypeCounts || []) {
    rulesByTriggerType[rule.trigger_type] = (rulesByTriggerType[rule.trigger_type] || 0) + 1;
  }
  
  // Get rules by action type
  const { data: actionTypeCounts } = await supabase
    .from('happiness_automation_rules')
    .select('action_type')
    .eq('status', 'active');
  
  const rulesByActionType: Record<string, number> = {};
  for (const rule of actionTypeCounts || []) {
    rulesByActionType[rule.action_type] = (rulesByActionType[rule.action_type] || 0) + 1;
  }
  
  return {
    active_rules: activeRules || 0,
    total_audience_reached: totalAudienceReached || 0,
    total_conversions: totalConversions || 0,
    pending_csm_nudges: pendingCsmNudges || 0,
    rules_by_trigger_type: rulesByTriggerType as any,
    rules_by_action_type: rulesByActionType as any,
  };
}

// ============================================================================
// Scheduled Jobs (to be called by cron/scheduler)
// ============================================================================

/**
 * Evaluate all active rules and execute actions
 * This should be run periodically (e.g., daily)
 */
export async function runScheduledEvaluations(): Promise<{
  rulesEvaluated: number;
  actionsExecuted: number;
}> {
  const supabase = getDbClient();
  
  // Get all active rules
  const { data: activeRules } = await supabase
    .from('happiness_automation_rules')
    .select('id')
    .eq('status', 'active');
  
  let rulesEvaluated = 0;
  let actionsExecuted = 0;
  
  for (const rule of activeRules || []) {
    try {
      // Evaluate trigger and compute audience
      await evaluateRuleTrigger(rule.id);
      rulesEvaluated++;
      
      // Execute action
      const executions = await executeAction(rule.id);
      actionsExecuted += executions.length;
      
      // Record metrics
      await recordAutomationMetrics(rule.id);
    } catch (error) {
      console.error(
        `[HappinessAutomation] Error evaluating rule ${rule.id}:`,
        error
      );
    }
  }
  
  console.log(
    `[HappinessAutomation] Scheduled run complete: ${rulesEvaluated} rules evaluated, ${actionsExecuted} actions executed`
  );
  
  return { rulesEvaluated, actionsExecuted };
}
