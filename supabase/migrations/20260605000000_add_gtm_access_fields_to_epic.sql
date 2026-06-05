-- GTM Access operational tracking (ClearGO-owned, PM-editable)
ALTER TABLE epic
  ADD COLUMN IF NOT EXISTS actual_gtm_access_date text,
  ADD COLUMN IF NOT EXISTS gtm_access_confirmed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN epic.actual_gtm_access_date IS 'PM-entered actual/revised GTM org access date (YYYY-MM-DD)';
COMMENT ON COLUMN epic.gtm_access_confirmed IS 'Manual confirmation that GTM access has occurred';
