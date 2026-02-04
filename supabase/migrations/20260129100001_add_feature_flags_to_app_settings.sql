-- Add feature_flags column to app_settings for Settings > Other Settings
-- Stores enabled feature flag keys (e.g. ai_pruning, meetings, not_applicable)
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS feature_flags text[] DEFAULT '{}';

COMMENT ON COLUMN app_settings.feature_flags IS 'Enabled feature flag keys. Controls features like AI pruning, Meetings, Not Applicable criteria score.';
