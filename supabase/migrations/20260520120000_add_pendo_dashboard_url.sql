-- Optional link to Pendo dashboard for HEART metrics drill-down (funnel reports, etc.)
ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS pendo_dashboard_url text;

COMMENT ON COLUMN app_settings.pendo_dashboard_url IS 'URL to the team Pendo dashboard (shown on epic HEART metrics as an external link).';
