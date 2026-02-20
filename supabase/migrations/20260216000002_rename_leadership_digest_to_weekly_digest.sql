-- Rename leadership_digest columns to weekly_digest
-- This migration renames the notification type flags from leadership_digest to weekly_digest

-- Rename Slack notification flag column
ALTER TABLE app_settings RENAME COLUMN slack_leadership_digest TO slack_weekly_digest;

-- Rename Email notification flag column
ALTER TABLE app_settings RENAME COLUMN email_leadership_digest TO email_weekly_digest;

-- Update comments
COMMENT ON COLUMN app_settings.slack_weekly_digest IS 'Enable Slack notifications for weekly digest';
COMMENT ON COLUMN app_settings.email_weekly_digest IS 'Enable email notifications for weekly digest';

-- Update slack_channels JSONB column references in comments
-- Note: The actual JSONB data structure should use "weekly_digest" as the key
-- (e.g., {"weekly_digest": "#channel"}). Existing data with "leadership_digest" 
-- should be migrated by application code or manually updated in app_settings
