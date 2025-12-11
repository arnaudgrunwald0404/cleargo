-- Add Slack-related columns to launch and app_settings tables

-- Add optional Slack channel override to launch table
ALTER TABLE launch ADD COLUMN IF NOT EXISTS slack_channel text;
COMMENT ON COLUMN launch.slack_channel IS 'Optional: Override default Slack channel for this launch notifications';

-- Add Slack configuration to app_settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_default_channel text DEFAULT '#launch-readiness';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_channels jsonb DEFAULT '{}'::jsonb;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS stale_criterion_days integer DEFAULT 14;

COMMENT ON COLUMN app_settings.slack_default_channel IS 'Default Slack channel for launch notifications';
COMMENT ON COLUMN app_settings.slack_channels IS 'Channel overrides for specific notification types (e.g., {"leadership_digest": "#leadership", "high_risk_alerts": "#alerts"})';
COMMENT ON COLUMN app_settings.stale_criterion_days IS 'Number of days before a criterion is considered stale and triggers a nudge';
