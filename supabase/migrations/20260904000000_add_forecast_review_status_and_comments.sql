-- Forecast review-status workflow (Draft / Ready for Review / In Review / Aligned) and
-- comments/notes on a forecast. review_status is deliberately a separate column from
-- forecast_runs.status (which tracks generation lifecycle: pending/running/complete/error).

ALTER TABLE forecast_runs
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft';

ALTER TABLE forecast_runs
  DROP CONSTRAINT IF EXISTS forecast_runs_review_status_check;

ALTER TABLE forecast_runs
  ADD CONSTRAINT forecast_runs_review_status_check
  CHECK (review_status IN ('draft', 'ready_for_review', 'in_review', 'aligned'));

CREATE TABLE IF NOT EXISTS forecast_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_aha_id text NOT NULL,
  comment_text text NOT NULL CHECK (LENGTH(TRIM(comment_text)) > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forecast_comments_epic_aha_id
  ON forecast_comments (epic_aha_id, created_at DESC);

ALTER TABLE forecast_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forecast_comments_select_authenticated" ON forecast_comments;
CREATE POLICY "forecast_comments_select_authenticated"
  ON forecast_comments FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "forecast_comments_insert_authenticated" ON forecast_comments;
CREATE POLICY "forecast_comments_insert_authenticated"
  ON forecast_comments FOR INSERT
  TO authenticated
  WITH CHECK (true);

GRANT ALL ON forecast_comments TO service_role;
GRANT SELECT, INSERT ON forecast_comments TO authenticated;
