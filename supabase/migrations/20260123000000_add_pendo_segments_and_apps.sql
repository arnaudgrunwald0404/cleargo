-- Add Pendo segment and app configuration to epic_success_metrics
-- This enables per-epic metric filtering by one or more Pendo segments and apps.

ALTER TABLE public.epic_success_metrics
  ADD COLUMN IF NOT EXISTS pendo_segment_ids text[] NULL,
  ADD COLUMN IF NOT EXISTS pendo_segment_names text[] NULL,
  ADD COLUMN IF NOT EXISTS pendo_app_ids text[] NULL,
  ADD COLUMN IF NOT EXISTS pendo_app_names text[] NULL;

COMMENT ON COLUMN public.epic_success_metrics.pendo_segment_ids IS 'Pendo segment IDs used to filter this metric for the epic (union of segments).';
COMMENT ON COLUMN public.epic_success_metrics.pendo_segment_names IS 'Human-readable Pendo segment names corresponding to pendo_segment_ids.';
COMMENT ON COLUMN public.epic_success_metrics.pendo_app_ids IS 'Pendo app identifiers to break out this metric by app for the epic.';
COMMENT ON COLUMN public.epic_success_metrics.pendo_app_names IS 'Human-readable Pendo app names corresponding to pendo_app_ids.';

