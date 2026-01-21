-- Add aha_webhook_environment column to app_settings table
-- This allows storing the environment mode (development/production) for webhook URL configuration

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS aha_webhook_environment text CHECK (aha_webhook_environment IN ('development', 'production'));

COMMENT ON COLUMN app_settings.aha_webhook_environment IS 'Environment mode for webhook URL: development (allows ngrok) or production (uses production domain). Defaults to development if not set.';
