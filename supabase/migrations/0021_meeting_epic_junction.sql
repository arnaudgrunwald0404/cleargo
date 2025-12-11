-- 0021_meeting_epic_junction.sql
-- Create junction table for many-to-many relationship between meetings and epics
-- This allows a meeting to be linked to multiple epics

CREATE TABLE IF NOT EXISTS meeting_epic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  epic_id uuid NOT NULL REFERENCES epic(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, epic_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_epic_meeting ON meeting_epic(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_epic_epic ON meeting_epic(epic_id);

-- Enable RLS
ALTER TABLE meeting_epic ENABLE ROW LEVEL SECURITY;

-- RLS Policies for meeting_epic
CREATE POLICY "Authenticated users can view meeting epics" 
  ON meeting_epic FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can insert meeting epics" 
  ON meeting_epic FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete meeting epics" 
  ON meeting_epic FOR DELETE 
  TO authenticated 
  USING (true);




