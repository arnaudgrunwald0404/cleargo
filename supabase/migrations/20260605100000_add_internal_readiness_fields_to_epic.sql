-- Internal Readiness operational tracking (ClearGO-owned, PM-editable)
ALTER TABLE epic
  ADD COLUMN IF NOT EXISTS actual_internal_readiness_date text,
  ADD COLUMN IF NOT EXISTS internal_readiness_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_readiness_na boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN epic.actual_internal_readiness_date IS 'PM-entered actual/revised Internal Readiness distributed date (YYYY-MM-DD)';
COMMENT ON COLUMN epic.internal_readiness_confirmed IS 'Manual confirmation that Internal Readiness has been distributed';
COMMENT ON COLUMN epic.internal_readiness_na IS 'PM marked Internal Readiness as not applicable for this epic';
