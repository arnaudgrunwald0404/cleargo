-- Add ui_framework_only to criterion for rollout-type-specific criteria.
-- When true, the criterion is only applicable to epics where ClearGO Candidate = "Yes - UI Framework" in Aha.
ALTER TABLE criterion
  ADD COLUMN IF NOT EXISTS ui_framework_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN criterion.ui_framework_only IS 'When true, this criterion only applies to epics with ClearGO Candidate = "Yes - UI Framework" in Aha.';
