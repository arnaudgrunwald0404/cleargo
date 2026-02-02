/**
 * TypeScript types for HEART Metrics Framework
 * Google's HEART: Happiness, Engagement, Adoption, Retention, Task Success
 */

// ============================================================================
// HEART Categories
// ============================================================================

export type HeartCategoryId = 'happiness' | 'engagement' | 'adoption' | 'retention' | 'task_success';

export interface HeartCategory {
  id: HeartCategoryId;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  requires_survey: boolean;
  created_at: string;
}

// ============================================================================
// Measurement Types
// ============================================================================

export type HeartMeasurementType =
  | 'events_per_user'           // Engagement: total events / unique users
  | 'events_per_user_per_week'  // Engagement: events per user per week
  | 'unique_users_percentage'   // Adoption: unique users / total eligible users
  | 'unique_users_count'        // Adoption: raw count of users who used feature
  | 'return_rate_7_days'        // Retention: % who used again within 7 days
  | 'return_rate_14_days'       // Retention: % who used again within 14 days
  | 'return_rate_30_days'       // Retention: % who used again within 30 days
  | 'completion_rate'           // Task Success: completions / starts
  | 'success_rate'              // Task Success: successes / attempts
  | 'survey_score'              // Happiness: average survey response
  | 'nps_score';                // Happiness: Net Promoter Score

// ============================================================================
// Setup Methods
// ============================================================================

export type HeartSetupMethod = 'auto' | 'ai_assisted' | 'manual';

// ============================================================================
// Status Types
// ============================================================================

export type HeartConfigStatus = 'draft' | 'active' | 'archived';

export type HeartMetricStatus = 'ON_TRACK' | 'AT_RISK' | 'MISSED' | 'PENDING';

export type HeartSurveyStatus = 'draft' | 'pending_approval' | 'active' | 'paused' | 'completed' | 'cancelled';

export type HeartSurveyType = 'nps' | 'satisfaction' | 'yes_no' | 'custom';

// ============================================================================
// Epic HEART Config
// ============================================================================

export interface EpicHeartConfig {
  id: string;
  epic_id: string;
  setup_method: HeartSetupMethod;
  ai_model_version: string | null;
  status: HeartConfigStatus;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Epic HEART Metric
// ============================================================================

export interface EpicHeartMetric {
  id: string;
  epic_heart_config_id: string;
  heart_category: HeartCategoryId | null; // Nullable for custom metrics
  name: string;
  description: string | null;
  measurement_type: HeartMeasurementType;
  pendo_event_ids: string[];
  pendo_segment_id: string | null;
  pendo_app_id: string | null;
  target_value: number | null;
  target_timeframe_days: number | null;
  ai_suggested: boolean;
  ai_rationale: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Custom metric fields
  is_custom?: boolean;
  custom_category_label?: string | null;
  custom_icon?: string | null;
  template_id?: string | null;
  // Milestones (loaded separately)
  milestones?: HeartMetricMilestone[];
}

// ============================================================================
// Metric Milestones (multiple targets over time)
// ============================================================================

export interface HeartMetricMilestone {
  id: string;
  epic_heart_metric_id: string;
  days_after_launch: number;
  target_value: number;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateHeartMetricMilestoneDTO {
  days_after_launch: number;
  target_value: number;
  label?: string;
}

export interface MilestoneProgress {
  milestone: HeartMetricMilestone;
  currentValue: number | null;
  status: HeartMetricStatus;
  daysRemaining: number | null;
  percentComplete: number; // Progress toward this milestone's target
}

// ============================================================================
// Epic HEART Snapshot
// ============================================================================

export interface EpicHeartSnapshot {
  id: string;
  epic_heart_metric_id: string;
  snapshot_date: string; // ISO date string (YYYY-MM-DD)
  value: number | null;
  target_at_snapshot: number | null;
  status: HeartMetricStatus;
  pendo_raw_data: Record<string, any> | null;
  calculated_at: string;
  // Data confidence indicators
  data_confidence?: PendoDataConfidence | null;
}

// ============================================================================
// Pendo Data Confidence
// ============================================================================

export type PendoDataConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface PendoDataConfidence {
  level: PendoDataConfidenceLevel;
  score: number; // 0-100
  issues: PendoDataIssue[];
}

export interface PendoDataIssue {
  type: 
    | 'no_recent_data'       // Feature/event has no clicks in lookback period
    | 'low_volume'           // Very few events (statistically insignificant)
    | 'missing_feature'      // Referenced feature doesn't exist in Pendo
    | 'missing_event'        // Referenced event doesn't exist in Pendo
    | 'segment_empty'        // Segment has no users
    | 'data_gap'             // Missing data for some days
    | 'tag_naming';          // Feature name suggests potential tagging issue
  severity: 'warning' | 'error';
  message: string;
}

// ============================================================================
// HEART Survey
// ============================================================================

export interface HeartSurvey {
  id: string;
  epic_heart_metric_id: string;
  survey_type: HeartSurveyType;
  question: string;
  target_event_ids: string[] | null;
  target_segment_id: string | null;
  min_uses_before_survey: number;
  days_after_first_use: number;
  status: HeartSurveyStatus;
  created_by: string;
  activated_by: string | null;
  activated_at: string | null;
  paused_by: string | null;
  paused_at: string | null;
  pendo_guide_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// HEART Survey Response
// ============================================================================

export interface HeartSurveyResponse {
  id: string;
  heart_survey_id: string;
  pendo_visitor_id: string;
  response_value: number;
  responded_at: string;
  synced_at: string;
}

// ============================================================================
// Pendo Events Cache
// ============================================================================

export interface PendoEventCached {
  id: string;
  event_name: string;
  product_area: string | null;
  description: string | null;
  user_count: number | null;
  event_count: number | null;
  last_seen_at: string | null;
  synced_at: string;
  created_at: string;
}

// ============================================================================
// DTOs for API Requests
// ============================================================================

export interface CreateEpicHeartConfigDTO {
  epic_id: string;
  setup_method: HeartSetupMethod;
}

export interface CreateEpicHeartMetricDTO {
  epic_heart_config_id: string;
  heart_category: HeartCategoryId;
  name: string;
  description?: string | null;
  measurement_type: HeartMeasurementType;
  pendo_event_ids: string[];
  pendo_segment_id?: string | null;
  pendo_app_id?: string | null;
  target_value?: number | null;
  target_timeframe_days?: number | null;
  ai_suggested?: boolean;
  ai_rationale?: string | null;
}

export interface UpdateEpicHeartMetricDTO {
  name?: string;
  description?: string | null;
  measurement_type?: HeartMeasurementType;
  pendo_event_ids?: string[];
  pendo_segment_id?: string | null;
  pendo_app_id?: string | null;
  target_value?: number | null;
  target_timeframe_days?: number | null;
  is_active?: boolean;
}

export interface CreateHeartSurveyDTO {
  epic_heart_metric_id: string;
  survey_type: HeartSurveyType;
  question: string;
  target_event_ids?: string[] | null;
  target_segment_id?: string | null;
  min_uses_before_survey?: number;
  days_after_first_use?: number;
}

// ============================================================================
// AI Agent Types
// ============================================================================

export interface PendoEventForAgent {
  name: string;
  productArea: string | null;
  description: string | null;
  userCount: number;
  eventCount: number;
}

export interface PendoFeatureForAgent {
  id: string;
  name: string;
  appId: string;
  kind: string;
  group: string | null;
}

export interface PendoContextForAgent {
  events: PendoEventForAgent[];
  features: PendoFeatureForAgent[];
  segments: Array<{ id: string; name: string }>;
  apps: Array<{ id: string; name: string }>;
}

export interface EpicContextForAgent {
  id: string;
  name: string;
  description: string | null;
  productArea: string | null;
  launchDate: string | null;
  tier: string | null;
  successCriteria: string[];
}

export interface HeartAgentRecommendation {
  engagement?: {
    eventIds: string[];
    measurementType: HeartMeasurementType;
    targetValue?: number | null;
    targetTimeframeDays?: number | null;
    rationale: string;
  };
  adoption?: {
    eventIds: string[];
    measurementType: HeartMeasurementType;
    segmentId?: string | null;
    targetValue?: number | null;
    targetTimeframeDays?: number | null;
    rationale: string;
  };
  retention?: {
    eventIds: string[];
    measurementType: HeartMeasurementType;
    rationale: string;
  };
  taskSuccess?: {
    eventIds: string[];
    measurementType: HeartMeasurementType;
    rationale: string;
  };
  happiness?: {
    surveyType: HeartSurveyType;
    suggestedQuestion: string;
    rationale: string;
  };
}

// ============================================================================
// UI Display Types
// ============================================================================

export interface HeartMetricDisplay {
  category: HeartCategory;
  metric: EpicHeartMetric | null;
  latestSnapshot: EpicHeartSnapshot | null;
  survey: HeartSurvey | null;
  trend: 'up' | 'down' | 'stable' | null;
  /** Whether the epic is pre-launch (launch date in future or not set) */
  isPreLaunch?: boolean;
  /** Human-readable measurement period (e.g. "Last 7 days", "Since launch (Day 5)") */
  measurementPeriod?: string;
  /** Milestone progress for multi-target metrics */
  milestoneProgress?: MilestoneProgress[];
  /** Current active milestone (the next one to hit) */
  currentMilestone?: MilestoneProgress | null;
  /** Next upcoming milestone */
  nextMilestone?: HeartMetricMilestone | null;
}

export interface EpicHeartDashboard {
  config: EpicHeartConfig;
  metrics: HeartMetricDisplay[];
  overallStatus: HeartMetricStatus;
  daysSinceLaunch: number | null;
  /** The epic's launch date (measurement starts from this date) */
  launchDate: string | null;
  /** Map of Pendo event name or feature id -> display name (for showing names instead of IDs in UI) */
  pendoEventIdToName?: Record<string, string>;
}

export interface HeartDashboardSummary {
  totalEpicsWithHeart: number;
  epicsByStatus: {
    onTrack: number;
    atRisk: number;
    missed: number;
    pending: number;
  };
  metricsByCategory: {
    [key in HeartCategoryId]: {
      configured: number;
      onTrack: number;
      atRisk: number;
      missed: number;
    };
  };
}

// ============================================================================
// HEART Settings Types (Admin-configurable defaults)
// ============================================================================

export interface HeartCategoryDefault {
  id: string;
  heart_category: HeartCategoryId;
  default_target_value: number | null;
  default_target_timeframe_days: number | null;
  default_measurement_type: HeartMeasurementType | null;
  guidance_text: string | null;
  example_events: string[] | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateHeartCategoryDefaultDTO {
  default_target_value?: number | null;
  default_target_timeframe_days?: number | null;
  default_measurement_type?: HeartMeasurementType | null;
  guidance_text?: string | null;
  example_events?: string[] | null;
}

// ============================================================================
// Custom Metric Templates (Reusable beyond HEART)
// ============================================================================

export interface HeartCustomMetricTemplate {
  id: string;
  name: string;
  description: string | null;
  category_label: string;
  icon: string;
  measurement_type: HeartMeasurementType;
  pendo_event_pattern: string | null;
  default_target_value: number | null;
  default_target_timeframe_days: number | null;
  is_active: boolean;
  usage_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomMetricTemplateDTO {
  name: string;
  description?: string | null;
  category_label: string;
  icon?: string;
  measurement_type: HeartMeasurementType;
  pendo_event_pattern?: string | null;
  default_target_value?: number | null;
  default_target_timeframe_days?: number | null;
}

export interface UpdateCustomMetricTemplateDTO {
  name?: string;
  description?: string | null;
  category_label?: string;
  icon?: string;
  measurement_type?: HeartMeasurementType;
  pendo_event_pattern?: string | null;
  default_target_value?: number | null;
  default_target_timeframe_days?: number | null;
  is_active?: boolean;
}

// Extended EpicHeartMetric with custom metric fields
export interface EpicHeartMetricExtended extends EpicHeartMetric {
  is_custom: boolean;
  custom_category_label: string | null;
  custom_icon: string | null;
  template_id: string | null;
}

// ============================================================================
// Computed Types for Lists
// ============================================================================

export interface EpicHeartListItem {
  epicId: string;
  epicName: string;
  launchDate: string | null;
  tier: string | null;
  heartConfigId: string | null;
  setupMethod: HeartSetupMethod | null;
  overallStatus: HeartMetricStatus | null;
  categoryStatuses: {
    happiness: HeartMetricStatus | null;
    engagement: HeartMetricStatus | null;
    adoption: HeartMetricStatus | null;
    retention: HeartMetricStatus | null;
    task_success: HeartMetricStatus | null;
  };
}

// ============================================================================
// Happiness Automation Types
// ============================================================================

export type HappinessTriggerType =
  | 'segment_non_usage'    // Users in segment X haven't used feature Y
  | 'usage_drop'           // Usage has dropped below threshold
  | 'negative_feedback'    // Survey response below threshold
  | 'feature_struggle'     // High error rate or abandonment
  | 'time_since_launch';   // X days after launch with low adoption

export type HappinessActionType =
  | 'pendo_guide'          // Show a Pendo in-app guide
  | 'pendo_nps'            // Trigger NPS/satisfaction survey
  | 'csm_notification'     // Notify CSM to reach out
  | 'slack_alert'          // Send alert to Slack channel
  | 'email_campaign'       // Trigger email campaign (coming soon)
  | 'custom_webhook';      // Call custom webhook (coming soon)

export type HappinessAutomationStatus =
  | 'draft'
  | 'pending_approval'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';

export type HappinessActionExecutionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

// Trigger configurations by type
export interface SegmentNonUsageTriggerConfig {
  segment_id: string;
  segment_name?: string;
  feature_id?: string;        // Pendo feature tag ID
  feature_name?: string;
  event_ids?: string[];       // Or track events (alternative to feature_id)
  lookback_days: number;      // How far back to check for usage
  min_segment_size?: number;  // Minimum users in segment to trigger
}

export interface UsageDropTriggerConfig {
  feature_id?: string;
  event_ids?: string[];
  drop_threshold_percent: number; // e.g., 20 = 20% drop
  comparison_period_days: number; // Compare last X days vs previous X days
}

export interface NegativeFeedbackTriggerConfig {
  survey_id: string;
  threshold_score: number;    // Trigger if score below this
  min_responses?: number;     // Minimum responses before triggering
}

export interface TimeSinceLaunchTriggerConfig {
  days_after_launch: number;
  adoption_threshold_percent: number; // Trigger if adoption below this %
}

export type HappinessTriggerConfig =
  | SegmentNonUsageTriggerConfig
  | UsageDropTriggerConfig
  | NegativeFeedbackTriggerConfig
  | TimeSinceLaunchTriggerConfig;

// Action configurations by type
export interface PendoGuideActionConfig {
  guide_id?: string;              // Existing Pendo guide ID
  guide_name?: string;
  target_segment_id?: string;     // Create dynamic segment for targeting
  activation_mode: 'auto' | 'manual'; // Auto-activate or wait for approval
}

export interface CsmNotificationActionConfig {
  notification_channel: 'slack' | 'email';
  slack_channel_id?: string;
  slack_channel_name?: string;
  email_recipients?: string[];
  message_template: string;       // Supports {{account_name}}, {{feature_name}}, etc.
  include_account_details: boolean;
  include_non_user_list: boolean;
  suggested_action?: string;      // What the CSM should do
}

export interface SlackAlertActionConfig {
  channel_id: string;
  channel_name?: string;
  message_template: string;
  mention_users?: string[];       // Slack user IDs to @mention
  include_metrics: boolean;
}

export type HappinessActionConfig =
  | PendoGuideActionConfig
  | CsmNotificationActionConfig
  | SlackAlertActionConfig;

// Main automation rule
export interface HappinessAutomationRule {
  id: string;
  epic_heart_metric_id: string | null;
  epic_id: string | null;
  name: string;
  description: string | null;
  trigger_type: HappinessTriggerType;
  trigger_config: HappinessTriggerConfig;
  action_type: HappinessActionType;
  action_config: HappinessActionConfig;
  status: HappinessAutomationStatus;
  is_recurring: boolean;
  recurrence_interval_days: number | null;
  max_executions_per_user: number;
  cooldown_days: number;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  last_evaluated_at: string | null;
}

// Target audience member
export interface HappinessTargetAudienceMember {
  id: string;
  rule_id: string;
  pendo_visitor_id: string;
  pendo_account_id: string | null;
  visitor_email: string | null;
  account_name: string | null;
  has_been_actioned: boolean;
  actioned_at: string | null;
  converted_at: string | null;
  computed_at: string;
}

// Action execution
export interface HappinessActionExecution {
  id: string;
  rule_id: string;
  target_audience_id: string | null;
  status: HappinessActionExecutionStatus;
  action_type: HappinessActionType;
  action_payload: Record<string, any>;
  result_data: Record<string, any> | null;
  error_message: string | null;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// CSM nudge
export interface HappinessCsmNudge {
  id: string;
  rule_id: string;
  execution_id: string | null;
  pendo_account_id: string;
  account_name: string | null;
  assigned_csm_email: string | null;
  assigned_at: string | null;
  status: 'pending' | 'assigned' | 'contacted' | 'resolved' | 'dismissed';
  context: {
    epic_name?: string;
    feature_name?: string;
    segment_name?: string;
    non_user_count?: number;
    days_since_launch?: number;
    suggested_action?: string;
    non_users?: Array<{ visitorId: string; email?: string }>;
  };
  csm_notes: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  contacted_at: string | null;
  resolved_at: string | null;
}

// Automation metrics snapshot
export interface HappinessAutomationMetrics {
  id: string;
  rule_id: string;
  snapshot_date: string;
  total_in_segment: number;
  total_non_users: number;
  actions_triggered: number;
  actions_completed: number;
  actions_failed: number;
  conversions: number;
  conversion_rate: number | null;
  created_at: string;
}

// DTOs for creating/updating
export interface CreateHappinessAutomationRuleDTO {
  epic_heart_metric_id?: string;
  epic_id?: string;
  name: string;
  description?: string;
  trigger_type: HappinessTriggerType;
  trigger_config: HappinessTriggerConfig;
  action_type: HappinessActionType;
  action_config: HappinessActionConfig;
  is_recurring?: boolean;
  recurrence_interval_days?: number;
  max_executions_per_user?: number;
  cooldown_days?: number;
}

export interface UpdateHappinessAutomationRuleDTO {
  name?: string;
  description?: string;
  trigger_config?: HappinessTriggerConfig;
  action_config?: HappinessActionConfig;
  status?: HappinessAutomationStatus;
  is_recurring?: boolean;
  recurrence_interval_days?: number;
  max_executions_per_user?: number;
  cooldown_days?: number;
}

// Display types for UI
export interface HappinessAutomationRuleDisplay extends HappinessAutomationRule {
  epic_name?: string;
  heart_metric_name?: string;
  audience_count?: number;
  last_execution?: HappinessActionExecution | null;
  metrics_summary?: {
    total_reached: number;
    total_converted: number;
    conversion_rate: number;
  };
}

export interface HappinessDashboardSummary {
  active_rules: number;
  total_audience_reached: number;
  total_conversions: number;
  pending_csm_nudges: number;
  rules_by_trigger_type: Record<HappinessTriggerType, number>;
  rules_by_action_type: Record<HappinessActionType, number>;
}
