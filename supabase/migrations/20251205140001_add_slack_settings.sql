-- Add Slack-related columns to epic and app_settings tables
-- Note: table was renamed from 'launch' to 'epic' in migration 20240101000017

-- Add optional Slack channel override to epic table
ALTER TABLE epic ADD COLUMN IF NOT EXISTS slack_channel text;
COMMENT ON COLUMN epic.slack_channel IS 'Optional: Override default Slack channel for this epic notifications';

-- Add Slack configuration to app_settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_default_channel text DEFAULT '#launch-readiness';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_channels jsonb DEFAULT '{}'::jsonb;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS stale_criterion_days integer DEFAULT 14;

COMMENT ON COLUMN app_settings.slack_default_channel IS 'Default Slack channel for launch notifications';
COMMENT ON COLUMN app_settings.slack_channels IS 'Channel overrides for specific notification types (e.g., {"leadership_digest": "#leadership", "high_risk_alerts": "#alerts"})';
COMMENT ON COLUMN app_settings.stale_criterion_days IS 'Number of days before a criterion is considered stale and triggers a nudge';
