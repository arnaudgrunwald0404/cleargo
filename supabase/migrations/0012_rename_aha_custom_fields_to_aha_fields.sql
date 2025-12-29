-- Rename aha_custom_fields column to aha_fields
-- This better reflects that the column stores both standard and custom fields

-- Drop the old index
DROP INDEX IF EXISTS idx_launch_aha_custom_fields;

-- Rename the column
ALTER TABLE launch
  RENAME COLUMN aha_custom_fields TO aha_fields;

-- Update the comment
COMMENT ON COLUMN launch.aha_fields IS 'Dynamic AHA fields (standard and custom) stored as JSONB. Format: {"standard_fields": {...}, "custom_fields": {...}}. Allows adding/removing fields without schema changes.';

-- Recreate the index with the new column name
CREATE INDEX IF NOT EXISTS idx_launch_aha_fields ON launch USING gin(aha_fields);













