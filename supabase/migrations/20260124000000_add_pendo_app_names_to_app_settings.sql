-- Add configurable mapping for Pendo application names in app_settings
-- This allows admins to customize the display names for Pendo apps

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS pendo_app_names jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN app_settings.pendo_app_names IS 'Mapping of Pendo appId (string) to human-friendly application name (e.g., "-323232" -> "ClearCompany").';
