-- Add epic_watches table to track which epics users are watching
-- Used for "My scope" filtering functionality

CREATE TABLE IF NOT EXISTS epic_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES epic(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(epic_id, user_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_epic_watches_epic_id ON epic_watches(epic_id);
CREATE INDEX IF NOT EXISTS idx_epic_watches_user_id ON epic_watches(user_id);
CREATE INDEX IF NOT EXISTS idx_epic_watches_user_epic ON epic_watches(user_id, epic_id);

-- Enable RLS
ALTER TABLE epic_watches ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to manage watches (application layer enforces user-specific access)
DROP POLICY IF EXISTS "Authenticated users can select epic_watches" ON epic_watches;
CREATE POLICY "Authenticated users can select epic_watches" ON epic_watches
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert epic_watches" ON epic_watches;
CREATE POLICY "Authenticated users can insert epic_watches" ON epic_watches
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete epic_watches" ON epic_watches;
CREATE POLICY "Authenticated users can delete epic_watches" ON epic_watches
  FOR DELETE TO authenticated
  USING (true);

COMMENT ON TABLE epic_watches IS 'Tracks which epics users are watching for "My scope" filtering';
COMMENT ON COLUMN epic_watches.epic_id IS 'The epic being watched';
COMMENT ON COLUMN epic_watches.user_id IS 'The user watching the epic';
COMMENT ON COLUMN epic_watches.created_at IS 'When the watch was created';

