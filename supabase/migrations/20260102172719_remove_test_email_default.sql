-- Keep the default value for slack_notification_test_email as agrunwald@clearcompany.com
-- This ensures only test notifications are sent, but all notifications are logged
-- The default is already set in the original migration, so we just update the comment

COMMENT ON COLUMN app_settings.slack_notification_test_email IS 'Filter: only send email notifications to this email address. All notifications are logged, but only this email receives actual emails. Default: agrunwald@clearcompany.com';
COMMENT ON COLUMN app_settings.slack_notification_test_slack_handle IS 'Filter: only send Slack notifications to users with this Slack handle. All notifications are logged, but only matching users receive actual Slack messages.';

