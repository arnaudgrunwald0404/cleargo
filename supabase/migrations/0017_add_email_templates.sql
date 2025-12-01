-- 0017_add_email_templates.sql
-- Add email template fields to app_settings table

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS email_template_invite_subject text,
  ADD COLUMN IF NOT EXISTS email_template_invite_html text,
  ADD COLUMN IF NOT EXISTS email_template_remind_subject text,
  ADD COLUMN IF NOT EXISTS email_template_remind_html text,
  ADD COLUMN IF NOT EXISTS email_template_update_criteria_subject text,
  ADD COLUMN IF NOT EXISTS email_template_update_criteria_html text;

COMMENT ON COLUMN app_settings.email_template_invite_subject IS 'Custom subject line for invite emails';
COMMENT ON COLUMN app_settings.email_template_invite_html IS 'Custom HTML template for invite emails';
COMMENT ON COLUMN app_settings.email_template_remind_subject IS 'Custom subject line for reminder emails';
COMMENT ON COLUMN app_settings.email_template_remind_html IS 'Custom HTML template for reminder emails';
COMMENT ON COLUMN app_settings.email_template_update_criteria_subject IS 'Custom subject line for update criteria emails';
COMMENT ON COLUMN app_settings.email_template_update_criteria_html IS 'Custom HTML template for update criteria emails';

