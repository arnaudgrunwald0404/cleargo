-- Add ROVO integration settings to app_settings table

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS rovo_access_token text,
  ADD COLUMN IF NOT EXISTS rovo_refresh_token text,
  ADD COLUMN IF NOT EXISTS rovo_token_expires_at timestamp with time zone;

COMMENT ON COLUMN app_settings.rovo_access_token IS 'ROVO MCP Server OAuth access token (encrypted in application layer)';
COMMENT ON COLUMN app_settings.rovo_refresh_token IS 'ROVO MCP Server OAuth refresh token (encrypted in application layer)';
COMMENT ON COLUMN app_settings.rovo_token_expires_at IS 'ROVO access token expiration timestamp';
