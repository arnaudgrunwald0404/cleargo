-- Migration: Add default_milestones column to heart_category_defaults
-- Stores default milestone targets as JSON array

ALTER TABLE heart_category_defaults 
ADD COLUMN IF NOT EXISTS default_milestones JSONB DEFAULT NULL;

COMMENT ON COLUMN heart_category_defaults.default_milestones IS 'Default milestone targets as JSON array: [{days: 30, target: 30, label: "1 Month"}, ...]';

-- Migrate existing single targets to milestones format
UPDATE heart_category_defaults
SET default_milestones = jsonb_build_array(
  jsonb_build_object(
    'days', default_target_timeframe_days,
    'target', default_target_value,
    'label', CASE 
      WHEN default_target_timeframe_days <= 30 THEN '1 Month'
      WHEN default_target_timeframe_days <= 60 THEN '2 Months'
      WHEN default_target_timeframe_days <= 90 THEN '3 Months'
      WHEN default_target_timeframe_days <= 180 THEN '6 Months'
      ELSE default_target_timeframe_days || ' Days'
    END
  )
)
WHERE default_target_value IS NOT NULL 
  AND default_target_timeframe_days IS NOT NULL
  AND default_milestones IS NULL;
