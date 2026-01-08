import { z } from 'zod';
import type { LaunchTier, MetricCategory, MeasurementType, MetricSource, LeadingOrLagging } from './types';

// Threshold schema for success metrics
const thresholdTierSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  target: z.number().optional(),
}).refine(
  (data) => data.min !== undefined || data.max !== undefined || data.target !== undefined,
  { message: "At least one of min, max, or target must be provided" }
);

const metricThresholdsSchema = z.object({
  TIER_1: thresholdTierSchema,
  TIER_2: thresholdTierSchema,
  TIER_3: thresholdTierSchema,
});

// Adoption Benchmark Schema - Base object schema
const adoptionBenchmarkBaseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  launch_tier: z.enum(['TIER_1', 'TIER_2', 'TIER_3']),
  feature_type: z.string().min(1, "Feature type is required"),
  target_persona: z.string().min(1, "Target persona is required"),
  horizon_days: z.array(z.number().int().positive()).min(1, "At least one horizon day is required"),
  expected_activation: z.array(z.number().nonnegative()).min(1, "At least one expected activation value is required"),
  expected_usage_depth: z.array(z.number().nonnegative()).nullable().optional(),
  expected_ttfv_days: z.number().int().positive().nullable().optional(),
  segment_modifiers: z.record(z.unknown()).nullable().optional(),
  is_default: z.boolean().default(false),
  version: z.number().int().positive().default(1),
});

export const createAdoptionBenchmarkSchema = adoptionBenchmarkBaseSchema.refine(
  (data) => data.horizon_days.length === data.expected_activation.length,
  {
    message: "horizon_days and expected_activation arrays must have the same length",
    path: ["expected_activation"],
  }
).refine(
  (data) => !data.expected_usage_depth || data.horizon_days.length === data.expected_usage_depth.length,
  {
    message: "expected_usage_depth must have the same length as horizon_days",
    path: ["expected_usage_depth"],
  }
);

export const updateAdoptionBenchmarkSchema = adoptionBenchmarkBaseSchema.partial().refine(
  (data) => {
    // Only validate if both arrays are provided
    if (data.horizon_days && data.expected_activation) {
      return data.horizon_days.length === data.expected_activation.length;
    }
    return true;
  },
  {
    message: "horizon_days and expected_activation arrays must have the same length",
    path: ["expected_activation"],
  }
).refine(
  (data) => {
    // Only validate if expected_usage_depth is provided and horizon_days is provided
    if (data.expected_usage_depth && data.horizon_days) {
      return data.expected_usage_depth.length === data.horizon_days.length;
    }
    return true;
  },
  {
    message: "expected_usage_depth must have the same length as horizon_days",
    path: ["expected_usage_depth"],
  }
);

// Success Metric Schema - Base object schema
const successMetricBaseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(['ADOPTION', 'REVENUE', 'RETENTION', 'ENABLEMENT', 'FRICTION']),
  description: z.string().nullable().optional(),
  measurement_type: z.enum(['PERCENTAGE', 'COUNT', 'DURATION', 'BOOLEAN']),
  source: z.enum(['PENDO', 'SNOWFLAKE', 'MANUAL']),
  pendo_event_id: z.string().nullable().optional(),
  leading_or_lagging: z.enum(['LEADING', 'LAGGING']),
  thresholds: metricThresholdsSchema,
});

export const createSuccessMetricSchema = successMetricBaseSchema.refine(
  (data) => data.source !== 'PENDO' || data.pendo_event_id !== null,
  {
    message: "pendo_event_id is required when source is PENDO",
    path: ["pendo_event_id"],
  }
);

export const updateSuccessMetricSchema = successMetricBaseSchema.partial().refine(
  (data) => {
    // Only validate if source is PENDO
    if (data.source === 'PENDO') {
      return data.pendo_event_id !== null && data.pendo_event_id !== undefined;
    }
    return true;
  },
  {
    message: "pendo_event_id is required when source is PENDO",
    path: ["pendo_event_id"],
  }
);

// ============================================================================
// Epic Success Configuration Schemas
// ============================================================================

export const createEpicSuccessConfigSchema = z.object({
  benchmark_id: z.string().uuid("Invalid benchmark ID").optional(),
  post_launch_owner: z.string().uuid("Invalid post-launch owner ID").optional(),
});

export const updateEpicSuccessConfigSchema = createEpicSuccessConfigSchema.partial();

// ============================================================================
// Epic Success Metric Schemas
// ============================================================================

export const createEpicSuccessMetricSchema = z.object({
  metric_id: z.string().uuid("Invalid metric ID"),
  threshold_override: metricThresholdsSchema.nullable().optional(),
});

export const updateEpicSuccessMetricSchema = z.object({
  threshold_override: metricThresholdsSchema.nullable().optional(),
});

// ============================================================================
// Retro Schemas
// ============================================================================

const actionItemSchema = z.object({
  owner: z.string().min(1, "Owner is required"),
  text: z.string().min(1, "Action item text is required"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be in YYYY-MM-DD format"),
  completed: z.boolean().optional(),
});

export const submitEpicRetroSchema = z.object({
  day_marker: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  outcome: z.enum(['YES', 'PARTIAL', 'NO']),
  blockers: z.array(z.string()).nullable().optional(),
  assumptions_wrong: z.string().nullable().optional(),
  repeat_next_time: z.string().nullable().optional(),
  change_next_time: z.string().nullable().optional(),
  action_items: z.array(actionItemSchema).nullable().optional(),
});

export const updateEpicRetroSchema = submitEpicRetroSchema.partial();

