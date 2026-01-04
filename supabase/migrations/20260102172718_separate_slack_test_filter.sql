-- Separate Slack test filter from email test filter
-- slack_notification_test_email will be used for email notifications
-- slack_notification_test_slack_handle will be used for Slack notifications

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_notification_test_slack_handle text;

COMMENT ON COLUMN app_settings.slack_notification_test_slack_handle IS 'Temporary filter: only send Slack notifications to this Slack user handle (e.g., U12345678). Leave empty to send to all users.';
COMMENT ON COLUMN app_settings.slack_notification_test_email IS 'Temporary filter: only send email notifications to this email address. Leave empty to send to all users.';

