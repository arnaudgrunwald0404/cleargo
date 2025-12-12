-- Create feedback table for launches/epics
-- Feedback is attributed to someone, timestamped, and has a source

CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id uuid REFERENCES launch(id) ON DELETE CASCADE NOT NULL,
  feedback_text text NOT NULL,
  source text NOT NULL, -- e.g., 'slack', 'email', 'meeting', 'manual', 'aha'
  attributed_to_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  attributed_to_name text, -- Fallback if user is not in system
  attributed_to_email text,
  created_by_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_feedback_launch ON feedback(launch_id);
CREATE INDEX IF NOT EXISTS idx_feedback_attributed_to ON feedback(attributed_to_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_source ON feedback(source);

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all feedback
CREATE POLICY "Allow read access to authenticated users" ON public.feedback
    FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to create feedback
CREATE POLICY "Allow create access to authenticated users" ON public.feedback
    FOR INSERT TO authenticated WITH CHECK (true);

-- Allow users to update feedback they created
CREATE POLICY "Allow update own feedback" ON public.feedback
    FOR UPDATE TO authenticated 
    USING (created_by_id = auth.uid());

-- Allow users to delete feedback they created
CREATE POLICY "Allow delete own feedback" ON public.feedback
    FOR DELETE TO authenticated 
    USING (created_by_id = auth.uid());

-- Add comment for clarity
COMMENT ON TABLE public.feedback IS 'Feedback on launches/epics from various sources';
COMMENT ON COLUMN public.feedback.source IS 'Source of the feedback: slack, email, meeting, manual, aha, etc.';
COMMENT ON COLUMN public.feedback.attributed_to_id IS 'User who provided the feedback';
COMMENT ON COLUMN public.feedback.created_by_id IS 'User who created this feedback record';

