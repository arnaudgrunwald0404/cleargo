-- Google Drive/Docs OAuth, stored on app_settings.
--
-- Deliberately GLOBAL rather than per-user, mirroring the ROVO integration
-- (20260216000003) rather than the deleted Calendar one, which keyed tokens by
-- user_id in google_calendar_integrations.
--
-- The reason is governance. Launch documents are created by a background job
-- with no user present, so the connection belongs to ClearGO, not to a person.
-- When whoever authorised it leaves, any admin with settings.update can
-- reconnect — nothing has to be migrated, and no documents are orphaned,
-- because the launch folder lives on a shared drive that owns its own files.
--
-- The connected identity is recorded so the settings page can say WHO the
-- connection acts as. That matters: every document ClearGO creates shows that
-- person as its creator.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS google_access_token text,
  ADD COLUMN IF NOT EXISTS google_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_token_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS google_connected_email text,
  ADD COLUMN IF NOT EXISTS google_connected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS google_connected_by text;

COMMENT ON COLUMN app_settings.google_access_token IS 'Google OAuth access token. Short-lived (~1h); refreshed automatically from the refresh token.';
COMMENT ON COLUMN app_settings.google_refresh_token IS 'Google OAuth refresh token. Long-lived, but expires after 7 days if the OAuth consent screen is left in Testing mode — it must be Internal and published.';
COMMENT ON COLUMN app_settings.google_token_expires_at IS 'When the access token expires. Refreshed 5 minutes ahead of this.';
COMMENT ON COLUMN app_settings.google_connected_email IS 'The Google account ClearGO acts as. Every document it creates shows this person as creator.';
COMMENT ON COLUMN app_settings.google_connected_at IS 'When the connection was last established.';
COMMENT ON COLUMN app_settings.google_connected_by IS 'The ClearGO user who authorised the connection.';
