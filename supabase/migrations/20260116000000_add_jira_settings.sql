-- Add Jira integration settings to app_settings table

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS jira_domain text,
  ADD COLUMN IF NOT EXISTS jira_email text,
  ADD COLUMN IF NOT EXISTS jira_api_token text,
  ADD COLUMN IF NOT EXISTS jira_cloud_id text;

COMMENT ON COLUMN app_settings.jira_domain IS 'Jira domain (e.g., clearco.atlassian.net)';
COMMENT ON COLUMN app_settings.jira_email IS 'Email associated with Jira API token (required for Basic Auth)';
COMMENT ON COLUMN app_settings.jira_api_token IS 'Jira API token for authentication';
COMMENT ON COLUMN app_settings.jira_cloud_id IS 'Jira Cloud ID (required for API calls, fetched automatically)';
