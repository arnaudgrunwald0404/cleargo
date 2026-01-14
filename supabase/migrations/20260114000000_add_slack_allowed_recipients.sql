-- Add slack_allowed_recipients column to app_settings table
-- This is an array of email addresses that defines who can receive Slack messages

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_allowed_recipients text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN app_settings.slack_allowed_recipients IS 'Array of email addresses of users who can receive Slack messages. If empty, all users can receive messages.';
