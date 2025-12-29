-- 0019_meetings_and_google_calendar.sql
-- Create tables for meetings, transcripts, snippets, and Google Calendar integration

-- Google Calendar integrations table (stores OAuth tokens per admin user)
CREATE TABLE IF NOT EXISTS google_calendar_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text, -- Nullable: Google may not return refresh_token on re-authorization
  token_expires_at timestamptz NOT NULL,
  calendar_id text DEFAULT 'primary',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

COMMENT ON COLUMN google_calendar_integrations.refresh_token IS 
  'OAuth refresh token. May be null if Google did not return one (e.g., on re-authorization when token already exists).';

CREATE INDEX IF NOT EXISTS idx_gcal_integrations_user ON google_calendar_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_gcal_integrations_active ON google_calendar_integrations(is_active);

-- Meetings table (stores meeting metadata)
CREATE TABLE IF NOT EXISTS meeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  meeting_date timestamptz NOT NULL,
  duration_minutes int,
  calendar_event_id text UNIQUE,
  epic_id uuid REFERENCES epic(id) ON DELETE SET NULL,
  linked_epic_id uuid REFERENCES epic(id) ON DELETE SET NULL, -- Manual link
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_epic ON meeting(epic_id);
CREATE INDEX IF NOT EXISTS idx_meeting_linked_epic ON meeting(linked_epic_id);
CREATE INDEX IF NOT EXISTS idx_meeting_date ON meeting(meeting_date);
CREATE INDEX IF NOT EXISTS idx_meeting_calendar_event ON meeting(calendar_event_id);

-- Meeting transcripts table
CREATE TABLE IF NOT EXISTS meeting_transcript (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  transcript_text text NOT NULL,
  uploaded_by uuid REFERENCES app_user(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id)
);

CREATE INDEX IF NOT EXISTS idx_transcript_meeting ON meeting_transcript(meeting_id);

-- Meeting snippets table (LLM-extracted snippets linked to criteria)
CREATE TABLE IF NOT EXISTS meeting_snippet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  epic_id uuid NOT NULL REFERENCES epic(id) ON DELETE CASCADE,
  criterion_id uuid REFERENCES criterion(id) ON DELETE SET NULL, -- NULL means general snippet
  snippet_text text NOT NULL,
  context_start int, -- Character position in transcript
  context_end int,
  relevance_score numeric, -- 0-1 score from LLM
  extracted_at timestamptz NOT NULL DEFAULT now(),
  extracted_by uuid REFERENCES app_user(id)
);

CREATE INDEX IF NOT EXISTS idx_snippet_meeting ON meeting_snippet(meeting_id);
CREATE INDEX IF NOT EXISTS idx_snippet_epic ON meeting_snippet(epic_id);
CREATE INDEX IF NOT EXISTS idx_snippet_criterion ON meeting_snippet(criterion_id);

-- Add check_in_keywords to app_settings
ALTER TABLE app_settings 
  ADD COLUMN IF NOT EXISTS check_in_keywords text[] DEFAULT ARRAY['check-in', 'checkin', 'standup', 'sync', 'stand-up', 'status update'];

-- Enable RLS
ALTER TABLE google_calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_transcript ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_snippet ENABLE ROW LEVEL SECURITY;

-- RLS Policies for google_calendar_integrations
-- Allow authenticated users - API routes will filter by current user
DROP POLICY IF EXISTS "Authenticated users can view calendar integrations" ON google_calendar_integrations;
CREATE POLICY "Authenticated users can view calendar integrations" 
  ON google_calendar_integrations FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert calendar integrations" ON google_calendar_integrations;
CREATE POLICY "Authenticated users can insert calendar integrations" 
  ON google_calendar_integrations FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update calendar integrations" ON google_calendar_integrations;
CREATE POLICY "Authenticated users can update calendar integrations" 
  ON google_calendar_integrations FOR UPDATE 
  TO authenticated 
  USING (true);

-- RLS Policies for meeting
DROP POLICY IF EXISTS "Authenticated users can view meetings" ON meeting;
CREATE POLICY "Authenticated users can view meetings" 
  ON meeting FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert meetings" ON meeting;
CREATE POLICY "Authenticated users can insert meetings" 
  ON meeting FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update meetings" ON meeting;
CREATE POLICY "Authenticated users can update meetings" 
  ON meeting FOR UPDATE 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete meetings" ON meeting;
CREATE POLICY "Authenticated users can delete meetings" 
  ON meeting FOR DELETE 
  TO authenticated 
  USING (true);

-- RLS Policies for meeting_transcript
DROP POLICY IF EXISTS "Authenticated users can view transcripts" ON meeting_transcript;
CREATE POLICY "Authenticated users can view transcripts" 
  ON meeting_transcript FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert transcripts" ON meeting_transcript;
CREATE POLICY "Authenticated users can insert transcripts" 
  ON meeting_transcript FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update transcripts" ON meeting_transcript;
CREATE POLICY "Authenticated users can update transcripts" 
  ON meeting_transcript FOR UPDATE 
  TO authenticated 
  USING (true);

-- RLS Policies for meeting_snippet
DROP POLICY IF EXISTS "Authenticated users can view snippets" ON meeting_snippet;
CREATE POLICY "Authenticated users can view snippets" 
  ON meeting_snippet FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert snippets" ON meeting_snippet;
CREATE POLICY "Authenticated users can insert snippets" 
  ON meeting_snippet FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update snippets" ON meeting_snippet;
CREATE POLICY "Authenticated users can update snippets" 
  ON meeting_snippet FOR UPDATE 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete snippets" ON meeting_snippet;
CREATE POLICY "Authenticated users can delete snippets" 
  ON meeting_snippet FOR DELETE 
  TO authenticated 
  USING (true);

