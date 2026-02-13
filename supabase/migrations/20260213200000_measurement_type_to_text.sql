-- Change measurement_type from enum to text
-- This allows manual metrics to use free-text measurement descriptions
-- (e.g., "Unique Companies Count", "Monthly Active Users", etc.)

-- Step 1: Alter columns from enum to text
ALTER TABLE public.epic_heart_metrics
  ALTER COLUMN measurement_type TYPE text USING measurement_type::text;

ALTER TABLE public.heart_custom_metric_templates
  ALTER COLUMN measurement_type TYPE text USING measurement_type::text;

ALTER TABLE public.heart_category_defaults
  ALTER COLUMN default_measurement_type TYPE text USING default_measurement_type::text;

-- Step 2: Drop the enum type (no longer needed)
DROP TYPE IF EXISTS heart_measurement_type;
