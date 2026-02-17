-- Add ROVO redirect URL setting to app_settings table

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS rovo_redirect_url text;

COMMENT ON COLUMN app_settings.rovo_redirect_url IS 'Custom OAuth redirect URL for ROVO integration. If null, uses default computed URL.';
