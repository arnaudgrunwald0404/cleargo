-- Add comment_read_status table to track which comments each user has read
-- This enables showing unread vs read comments in the centralized comments view

CREATE TABLE IF NOT EXISTS comment_read_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES criterion_comment(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_comment_read_status_user_id_read_at 
  ON comment_read_status(user_id, read_at DESC);

CREATE INDEX IF NOT EXISTS idx_comment_read_status_comment_id 
  ON comment_read_status(comment_id);

-- Enable RLS
ALTER TABLE comment_read_status ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own read status
CREATE POLICY "Users can view their own read status" ON comment_read_status
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE id = user_id 
      AND LOWER(email) = LOWER(auth.jwt()->>'email')
    )
  );

-- RLS Policy: Users can view all read statuses (for admin/analytics)
CREATE POLICY "Authenticated users can view all read statuses" ON comment_read_status
  FOR SELECT TO authenticated
  USING (true);

-- RLS Policy: Users can insert/update their own read status
CREATE POLICY "Users can insert their own read status" ON comment_read_status
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE id = user_id 
      AND LOWER(email) = LOWER(auth.jwt()->>'email')
    )
  );

-- RLS Policy: Users can update their own read status
CREATE POLICY "Users can update their own read status" ON comment_read_status
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE id = user_id 
      AND LOWER(email) = LOWER(auth.jwt()->>'email')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE id = user_id 
      AND LOWER(email) = LOWER(auth.jwt()->>'email')
    )
  );

COMMENT ON TABLE comment_read_status IS 'Tracks which comments each user has read, enabling unread/read distinction in the comments view';
COMMENT ON COLUMN comment_read_status.comment_id IS 'The comment that was read';
COMMENT ON COLUMN comment_read_status.user_id IS 'The user who read the comment';
COMMENT ON COLUMN comment_read_status.read_at IS 'When the comment was marked as read';
