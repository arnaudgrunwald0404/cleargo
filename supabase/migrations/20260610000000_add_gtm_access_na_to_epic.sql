-- GTM Access N/A flag (mirrors internal_readiness_na)
ALTER TABLE epic
  ADD COLUMN IF NOT EXISTS gtm_access_na boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN epic.gtm_access_na IS 'PM marked GTM org access as not applicable for this epic';
