-- Add Slack notification settings columns to app_settings table

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_nudge_1_week_before boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_nudge_on_due_date boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_nudge_daily_after_due boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_notification_test_email text DEFAULT 'agrunwald@clearcompany.com';

COMMENT ON COLUMN app_settings.slack_nudge_1_week_before IS 'Send nudge notifications 1 week before criteria due date';
COMMENT ON COLUMN app_settings.slack_nudge_on_due_date IS 'Send nudge notifications on criteria due date';
COMMENT ON COLUMN app_settings.slack_nudge_daily_after_due IS 'Send daily nudge notifications after criteria due date';
COMMENT ON COLUMN app_settings.slack_notification_test_email IS 'Temporary filter: only send notifications to this email (will be removed on launch)';

