-- Add aha_webhook_url column to app_settings table
-- This allows storing a custom webhook URL instead of computing it from window.location.origin

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS aha_webhook_url text;

COMMENT ON COLUMN app_settings.aha_webhook_url IS 'Custom Aha! webhook URL. If null, defaults to computed URL based on origin.';

