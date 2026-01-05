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
// Adoption Benchmark
// ============================================================================

export interface AdoptionBenchmark {
  id: string;
  name: string;
  launch_tier: LaunchTier;
  feature_type: string;
  target_persona: string;
  horizon_days: number[];
  expected_activation: number[];
  expected_usage_depth: number[] | null;
  expected_ttfv_days: number | null;
  segment_modifiers: Record<string, unknown> | null;
  is_default: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Success Metric
// ============================================================================

export interface MetricThresholds {
  TIER_1: {
    min?: number;
    max?: number;
    target?: number;
  };
  TIER_2: {
    min?: number;
    max?: number;
    target?: number;
  };
  TIER_3: {
    min?: number;
    max?: number;
    target?: number;
  };
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
  thresholds: MetricThresholds;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Epic Success Config
// ============================================================================

export interface EpicSuccessConfig {
  epic_id: string;
  benchmark_id: string;
  post_launch_owner: string;
  locked: boolean;
  locked_at: string | null;
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
  created_at: string;
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

export interface BenchmarkComparison {
  horizons: number[]; // [30, 60, 90]
  expectedActivation: number[];
  actualActivation: number[] | null;
  dataMissing?: boolean;
}

export interface EpicScorecard {
  id: string;
  epic_id: string;
  snapshot_date: string; // ISO date string
  metric_results: MetricResult[];
  benchmark_comparison: BenchmarkComparison;
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

export interface CreateAdoptionBenchmarkDTO {
  name: string;
  launch_tier: LaunchTier;
  feature_type: string;
  target_persona: string;
  horizon_days: number[];
  expected_activation: number[];
  expected_usage_depth?: number[] | null;
  expected_ttfv_days?: number | null;
  segment_modifiers?: Record<string, unknown> | null;
  is_default?: boolean;
}

export interface CreateSuccessMetricDTO {
  name: string;
  category: MetricCategory;
  description?: string | null;
  measurement_type: MeasurementType;
  source: MetricSource;
  pendo_event_id?: string | null;
  leading_or_lagging: LeadingOrLagging;
  thresholds: MetricThresholds;
}

export interface CreateEpicSuccessConfigDTO {
  epic_id: string;
  benchmark_id: string;
  post_launch_owner?: string; // Optional - will be auto-resolved to PM if not provided
}

export interface CreateEpicSuccessMetricDTO {
  epic_id: string;
  metric_id: string;
  threshold_override?: MetricThresholds | null;
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

