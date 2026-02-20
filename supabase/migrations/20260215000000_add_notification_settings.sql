-- Add notification settings for email and system flags for Slack/Email
-- This supports the Settings > Notifications page with criteria notification matrix

-- Email notification settings (mirroring Slack settings)
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_nudge_1_week_before boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_nudge_on_due_date boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_nudge_daily_after_due boolean DEFAULT true;

-- System flags to enable/disable notification channels globally
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_notifications_enabled boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean DEFAULT true;

COMMENT ON COLUMN app_settings.email_nudge_1_week_before IS 'Send email nudge notifications 1 week before criteria due date';
COMMENT ON COLUMN app_settings.email_nudge_on_due_date IS 'Send email nudge notifications on criteria due date';
COMMENT ON COLUMN app_settings.email_nudge_daily_after_due IS 'Send daily email nudge notifications after criteria due date';
COMMENT ON COLUMN app_settings.slack_notifications_enabled IS 'System flag: Enable/disable all Slack notifications globally';
COMMENT ON COLUMN app_settings.email_notifications_enabled IS 'System flag: Enable/disable all email notifications globally';
