-- Add data_source_values column to epic_criterion_status table
-- This column stores the actual values for data sources (like URLs) per epic/criterion
-- Format: JSONB object with data source index as key and value as the value
-- Example: {"0": "https://figma.com/file/..."}

ALTER TABLE epic_criterion_status
  ADD COLUMN IF NOT EXISTS data_source_values jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN epic_criterion_status.data_source_values IS 'Stores actual values for data sources (like URLs) per epic/criterion. Format: {"0": "url_value", "1": "url_value2"}. Keys are data source indices from the criterion data_sources array.';
