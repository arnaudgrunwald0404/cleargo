/**
 * TypeScript domain types for success measurement feature
 */

// ============================================================================
// Enums
// ============================================================================

export type MetricCategory = 'ADOPTION' | 'REVENUE' | 'RETENTION' | 'ENABLEMENT' | 'FRICTION';

export type MeasurementType = 'PERCENTAGE' | 'COUNT' | 'DURATION' | 'BOOLEAN';

export type MetricSource = 'PENDO' | 'SNOWFLAKE' | 'MANUAL';

export type LeadingOrLagging = 'LEADING' | 'LAGGING';

export type ScorecardStatus = 'ON_TRACK' | 'AT_RISK' | 'MISSED';

export type RetroStatus = 'PENDING' | 'SUBMITTED';

export type RetroOutcome = 'YES' | 'PARTIAL' | 'NO';

export type LaunchTier = 'TIER_1' | 'TIER_2' | 'TIER_3';

export type DayMarker = 30 | 60 | 90;

// ============================================================================
// Success Metric (threshold-based, no adoption benchmarks)
// ============================================================================

export interface MetricThresholds {
  min?: number;
  max?: number;
  target?: number;
}

export interface SuccessMetric {
  id: string;
  name: string;
  category: MetricCategory;
  description: string | null;
  measurement_type: MeasurementType;
  source: MetricSource;
  pendo_event_id: string | null;
  leading_or_lagging: LeadingOrLagging;
  thresholds: MetricThresholds | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Epic Success Config
// ============================================================================

export interface EpicSuccessConfig {
  epic_id: string;
  post_launch_owner: string;
  locked: boolean;
  locked_at: string | null;
  track_offline: boolean;
  /** When set, success metrics are published and visible to all users; when null, draft (only configurers see). Omitted if migration not yet applied. */
  success_metrics_published_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Epic Success Metric
// ============================================================================

export interface EpicSuccessMetric {
  id: string;
  epic_id: string;
  metric_id: string;
  threshold_override: MetricThresholds | null;
  target: number | null;
  pendo_event_id: string | null;
  snowflake_query: string | null;
  manual_label: string | null;
  pendo_segment_ids?: string[] | null;
  pendo_segment_names?: string[] | null;
  pendo_app_ids?: string[] | null;
  pendo_app_names?: string[] | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Pendo Integration
// ============================================================================

export type PendoEnvironment = 'prod' | 'dev' | 'staging';

export type PendoStatus = 'connected' | 'disconnected' | 'error';

export interface PendoIntegration {
  id: string;
  api_key_encrypted: string;
  environment: PendoEnvironment;
  last_sync: string | null;
  status: PendoStatus;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Epic Scorecard
// ============================================================================

export interface MetricResult {
  metricId: string;
  metricName: string;
  actual: number | boolean | null;
  expected: number | null;
  status: ScorecardStatus;
  source: MetricSource;
}

export interface EpicScorecard {
  id: string;
  epic_id: string;
  snapshot_date: string; // ISO date string
  metric_results: MetricResult[];
  overall_status: ScorecardStatus;
  created_at: string;
}

// ============================================================================
// Epic Retro
// ============================================================================

export interface ActionItem {
  owner: string;
  text: string;
  dueDate: string; // ISO date string
  completed?: boolean;
}

export interface EpicRetro {
  id: string;
  epic_id: string;
  day_marker: DayMarker;
  status: RetroStatus;
  outcome: RetroOutcome | null;
  blockers: string[] | null;
  assumptions_wrong: string | null;
  repeat_next_time: string | null;
  change_next_time: string | null;
  action_items: ActionItem[] | null;
  submitted_by: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DTOs (Data Transfer Objects) for API requests/responses
// ============================================================================

export interface CreateSuccessMetricDTO {
  name: string;
  category: MetricCategory;
  description?: string | null;
  measurement_type: MeasurementType;
  source: MetricSource;
  pendo_event_id?: string | null;
  leading_or_lagging: LeadingOrLagging;
  thresholds?: MetricThresholds | null;
}

export interface CreateEpicSuccessConfigDTO {
  epic_id: string;
  post_launch_owner?: string; // Optional - will be auto-resolved to PM if not provided
  track_offline?: boolean; // If true, indicates this epic will track metrics offline (not automated)
}

export interface CreateEpicSuccessMetricDTO {
  epic_id: string;
  metric_id: string;
  threshold_override?: MetricThresholds | null;
  target?: number | null;
  pendo_event_id?: string | null;
  snowflake_query?: string | null;
  manual_label?: string | null;
  pendo_segment_ids?: string[] | null;
  pendo_segment_names?: string[] | null;
  pendo_app_ids?: string[] | null;
  pendo_app_names?: string[] | null;
}

export type MetricHistoryChangeType = 
  | 'METRIC_ADDED' 
  | 'METRIC_REMOVED' 
  | 'TARGET_SET' 
  | 'TARGET_UPDATED' 
  | 'EVENT_CONFIG_UPDATED';

export interface EpicSuccessMetricHistory {
  id: string;
  epic_success_metric_id: string | null;
  epic_id: string;
  metric_id: string;
  change_type: MetricHistoryChangeType;
  changed_by: {
    id: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
  };
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  changed_at: string;
}

export interface SubmitEpicRetroDTO {
  day_marker: DayMarker;
  outcome: RetroOutcome;
  blockers?: string[];
  assumptions_wrong?: string;
  repeat_next_time?: string;
  change_next_time?: string;
  action_items?: ActionItem[];
}

