-- Add per-user flag for Slack notifications (replaces hardcoded/test email list for Slack)
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS receive_slack_notifications boolean DEFAULT false;
COMMENT ON COLUMN app_user.receive_slack_notifications IS 'When true, this user receives Slack notifications. Managed via User Management table.';
