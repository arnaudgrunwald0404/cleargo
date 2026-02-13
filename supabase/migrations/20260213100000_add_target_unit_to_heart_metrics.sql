-- Add target_unit column to epic_heart_metrics
-- Allows manual metrics to specify what unit the target is in
-- e.g., "%", "Users", "Organizations", "Score", "Count", etc.
-- For Pendo metrics this defaults to '%'; for manual metrics it's user-defined.

ALTER TABLE public.epic_heart_metrics
  ADD COLUMN IF NOT EXISTS target_unit text NULL DEFAULT '%';

COMMENT ON COLUMN public.epic_heart_metrics.target_unit IS 'Unit of the target value (e.g. %, Users, Organizations, Score, Count)';
