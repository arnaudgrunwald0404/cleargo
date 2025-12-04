-- 0011_aha_fields_to_load.sql
-- Add configurable list of AHA fields to load with each launch
-- Add JSONB column to store dynamic AHA fields in launch table

-- Add aha_fields_to_load to app_settings
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS aha_fields_to_load jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN app_settings.aha_fields_to_load IS 'List of AHA custom field aliases to load with each launch. Format: ["dev_backlog_pod", "primary_goal", ...]';

-- Add aha_custom_fields JSONB column to launch table to store dynamic fields
ALTER TABLE launch
  ADD COLUMN IF NOT EXISTS aha_custom_fields jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN launch.aha_custom_fields IS 'Dynamic AHA custom fields stored as JSONB. Format: {"field_alias": "value", ...}. Allows adding/removing fields without schema changes.';

-- Create index on aha_custom_fields for efficient queries
CREATE INDEX IF NOT EXISTS idx_launch_aha_custom_fields ON launch USING gin(aha_custom_fields);



