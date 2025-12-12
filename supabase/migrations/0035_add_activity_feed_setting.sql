-- Add setting to enable/disable activity feed on home page
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS enable_activity_feed boolean NOT NULL DEFAULT true;

-- Add comment for clarity
COMMENT ON COLUMN app_settings.enable_activity_feed IS 'Whether to show the activity feed on the home page';

