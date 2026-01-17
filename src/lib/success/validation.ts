import { z } from 'zod';
import type { MetricCategory, MeasurementType, MetricSource, LeadingOrLagging } from './types';

// Threshold schema for success metrics (global thresholds, no tiers)
const metricThresholdsSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  target: z.number().optional(),
}).nullable().optional();

// Success Metric Schema - Base object schema (without refinements)
const successMetricBaseObjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(['ADOPTION', 'REVENUE', 'RETENTION', 'ENABLEMENT', 'FRICTION']),
  description: z.string().nullable().optional(),
  measurement_type: z.enum(['PERCENTAGE', 'COUNT', 'DURATION', 'BOOLEAN']),
  source: z.enum(['PENDO', 'SNOWFLAKE', 'MANUAL']),
  pendo_event_id: z.string().nullable().optional(),
  leading_or_lagging: z.enum(['LEADING', 'LAGGING']),
  thresholds: metricThresholdsSchema,
});

// Success Metric Schema - Base object schema with threshold validation
const successMetricBaseSchema = successMetricBaseObjectSchema.refine(
  (data) => {
    // If thresholds are provided, validate that at least one of min, max, or target has a value
    if (data.thresholds && typeof data.thresholds === 'object' && data.thresholds !== null) {
      const thresholds = data.thresholds as { min?: number; max?: number; target?: number };
      return thresholds.min !== undefined || thresholds.max !== undefined || thresholds.target !== undefined;
    }
    return true; // Thresholds are optional
  },
  { message: "If thresholds are provided, at least one of min, max, or target must be provided", path: ["thresholds"] }
);

export const createSuccessMetricSchema = successMetricBaseSchema.refine(
  (data) => data.source !== 'PENDO' || data.pendo_event_id !== null,
  {
    message: "pendo_event_id is required when source is PENDO",
    path: ["pendo_event_id"],
  }
);

export const updateSuccessMetricSchema = successMetricBaseObjectSchema.partial().refine(
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
).refine(
  (data) => {
    // If thresholds are provided, validate that at least one of min, max, or target has a value
    const thresholds = data.thresholds as { min?: number; max?: number; target?: number } | null | undefined;
    if (thresholds && typeof thresholds === 'object') {
      return thresholds.min !== undefined || thresholds.max !== undefined || thresholds.target !== undefined;
    }
    return true; // Thresholds are optional
  },
  { message: "If thresholds are provided, at least one of min, max, or target must be provided", path: ["thresholds"] }
);

// ============================================================================
// Epic Success Configuration Schemas
// ============================================================================

export const createEpicSuccessConfigSchema = z.object({
  post_launch_owner: z.string().uuid("Invalid post-launch owner ID").optional(),
  benchmark_id: z.string().uuid("Invalid benchmark ID").optional(),
});

export const updateEpicSuccessConfigSchema = createEpicSuccessConfigSchema.partial();

// ============================================================================
// Epic Success Metric Schemas
// ============================================================================

export const createEpicSuccessMetricSchema = z.object({
  metric_id: z.string().uuid("Invalid metric ID"),
  threshold_override: metricThresholdsSchema.nullable().optional(),
  target: z.number().nullable().optional(),
  pendo_event_id: z.string().nullable().optional(),
  snowflake_query: z.string().nullable().optional(),
  manual_label: z.string().nullable().optional(),
  pendo_segment_ids: z.array(z.string()).nullable().optional(),
  pendo_segment_names: z.array(z.string()).nullable().optional(),
  pendo_app_ids: z.array(z.string()).nullable().optional(),
  pendo_app_names: z.array(z.string()).nullable().optional(),
}).refine(
  (data) => {
    // Target is required when creating a metric
    return data.target !== null && data.target !== undefined;
  },
  { message: "Target is required", path: ["target"] }
).superRefine((_data, _ctx) => {
  // Intentionally synchronous: async validations are performed in the API handler.
});

export const updateEpicSuccessMetricSchema = z.object({
  threshold_override: metricThresholdsSchema.nullable().optional(),
  target: z.number().nullable().optional(),
  pendo_event_id: z.string().nullable().optional(),
  snowflake_query: z.string().nullable().optional(),
  manual_label: z.string().nullable().optional(),
  pendo_segment_ids: z.array(z.string()).nullable().optional(),
  pendo_segment_names: z.array(z.string()).nullable().optional(),
  pendo_app_ids: z.array(z.string()).nullable().optional(),
  pendo_app_names: z.array(z.string()).nullable().optional(),
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

