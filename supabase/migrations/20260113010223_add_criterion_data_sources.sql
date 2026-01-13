-- Add data_sources column to criterion table
-- This column stores an array of data sources for each criterion
-- Each data source can be: Aha field, Aha Description part, or URL

ALTER TABLE criterion
  ADD COLUMN IF NOT EXISTS data_sources jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN criterion.data_sources IS 'Array of data sources for this criterion. Each source has: {type: "aha_field"|"aha_description_part"|"url", value: string}. Max 5 sources allowed.';
