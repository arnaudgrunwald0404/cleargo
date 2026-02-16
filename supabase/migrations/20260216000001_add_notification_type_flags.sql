-- Add notification type flags for different notification types
-- This allows enabling/disabling specific notification types for Slack and Email

-- Slack notification type flags
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_criteria_assignment boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_criteria_nudge boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_retro_reminder boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_success_review_reminder boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_stale_criterion boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_launch_risk_alert boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_go_no_go_decision boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_leadership_digest boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_launch_status_change boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_criterion_update boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_launch_created boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_delegation boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_scorecard_alert boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_escalation_alert boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_criterion_comment_or_attachment boolean DEFAULT true;

-- Email notification type flags
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_criteria_assignment boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_criteria_nudge boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_retro_reminder boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_success_review_reminder boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_stale_criterion boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_launch_risk_alert boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_go_no_go_decision boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_leadership_digest boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_launch_status_change boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_criterion_update boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_launch_created boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_delegation boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_scorecard_alert boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_escalation_alert boolean DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_criterion_comment_or_attachment boolean DEFAULT true;

COMMENT ON COLUMN app_settings.slack_criteria_assignment IS 'Enable Slack notifications for criteria assignments';
COMMENT ON COLUMN app_settings.slack_criteria_nudge IS 'Enable Slack notifications for criteria nudges';
COMMENT ON COLUMN app_settings.slack_retro_reminder IS 'Enable Slack notifications for retro reminders';
COMMENT ON COLUMN app_settings.slack_success_review_reminder IS 'Enable Slack notifications for success review reminders';
COMMENT ON COLUMN app_settings.slack_stale_criterion IS 'Enable Slack notifications for stale criteria';
COMMENT ON COLUMN app_settings.slack_launch_risk_alert IS 'Enable Slack notifications for launch risk alerts';
COMMENT ON COLUMN app_settings.slack_go_no_go_decision IS 'Enable Slack notifications for go/no-go decisions';
COMMENT ON COLUMN app_settings.slack_leadership_digest IS 'Enable Slack notifications for leadership digest';
COMMENT ON COLUMN app_settings.slack_launch_status_change IS 'Enable Slack notifications for launch status changes';
COMMENT ON COLUMN app_settings.slack_criterion_update IS 'Enable Slack notifications for criterion updates';
COMMENT ON COLUMN app_settings.slack_launch_created IS 'Enable Slack notifications for launch creation';
COMMENT ON COLUMN app_settings.slack_delegation IS 'Enable Slack notifications for delegations';
COMMENT ON COLUMN app_settings.slack_scorecard_alert IS 'Enable Slack notifications for scorecard alerts';
COMMENT ON COLUMN app_settings.slack_escalation_alert IS 'Enable Slack notifications for escalation alerts';
COMMENT ON COLUMN app_settings.slack_criterion_comment_or_attachment IS 'Enable Slack notifications for criterion comments/attachments';

COMMENT ON COLUMN app_settings.email_criteria_assignment IS 'Enable email notifications for criteria assignments';
COMMENT ON COLUMN app_settings.email_criteria_nudge IS 'Enable email notifications for criteria nudges';
COMMENT ON COLUMN app_settings.email_retro_reminder IS 'Enable email notifications for retro reminders';
COMMENT ON COLUMN app_settings.email_success_review_reminder IS 'Enable email notifications for success review reminders';
COMMENT ON COLUMN app_settings.email_stale_criterion IS 'Enable email notifications for stale criteria';
COMMENT ON COLUMN app_settings.email_launch_risk_alert IS 'Enable email notifications for launch risk alerts';
COMMENT ON COLUMN app_settings.email_go_no_go_decision IS 'Enable email notifications for go/no-go decisions';
COMMENT ON COLUMN app_settings.email_leadership_digest IS 'Enable email notifications for leadership digest';
COMMENT ON COLUMN app_settings.email_launch_status_change IS 'Enable email notifications for launch status changes';
COMMENT ON COLUMN app_settings.email_criterion_update IS 'Enable email notifications for criterion updates';
COMMENT ON COLUMN app_settings.email_launch_created IS 'Enable email notifications for launch creation';
COMMENT ON COLUMN app_settings.email_delegation IS 'Enable email notifications for delegations';
COMMENT ON COLUMN app_settings.email_scorecard_alert IS 'Enable email notifications for scorecard alerts';
COMMENT ON COLUMN app_settings.email_escalation_alert IS 'Enable email notifications for escalation alerts';
COMMENT ON COLUMN app_settings.email_criterion_comment_or_attachment IS 'Enable email notifications for criterion comments/attachments';
