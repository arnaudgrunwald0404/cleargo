-- Add pod_order column to app_settings
-- This stores the user-defined order of pods for consistent display throughout the app

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS pod_order jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN app_settings.pod_order IS 'Ordered array of pod names for consistent display. Format: ["pod1", "pod2", ...]';

