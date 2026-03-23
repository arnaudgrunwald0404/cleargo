-- Track every GO/CONDITIONAL/NO_GO/NOT_SET/NOT_APPLICABLE transition
-- on epic_criterion_status so we can reconstruct timelines for retros.

CREATE TABLE IF NOT EXISTS criterion_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_criterion_status_id uuid NOT NULL REFERENCES epic_criterion_status(id) ON DELETE CASCADE,
  epic_id uuid NOT NULL REFERENCES epic(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES app_user(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csh_epic_changed
  ON criterion_status_history (epic_id, changed_at);

CREATE INDEX IF NOT EXISTS idx_csh_ecs_changed
  ON criterion_status_history (epic_criterion_status_id, changed_at);

-- RLS: authenticated users can read history for epics they have access to
ALTER TABLE criterion_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read criterion_status_history"
  ON criterion_status_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert criterion_status_history"
  ON criterion_status_history FOR INSERT
  TO authenticated
  WITH CHECK (true);
