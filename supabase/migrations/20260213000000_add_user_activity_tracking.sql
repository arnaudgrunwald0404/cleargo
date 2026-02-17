-- Add user activity tracking table for usage analytics
-- Tracks user logins, page views, and key actions

CREATE TABLE IF NOT EXISTS user_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_user(id) ON DELETE CASCADE,
  activity_type text NOT NULL, -- 'login', 'page_view', 'action'
  activity_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id_created_at ON user_activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_type_created_at ON user_activity(activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity(created_at DESC);

-- Enable RLS
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can read all activity (for analytics)
CREATE POLICY "Authenticated users can select user_activity" ON user_activity
  FOR SELECT TO authenticated
  USING (true);

-- RLS Policy: Users can insert their own activity
CREATE POLICY "Users can insert their own activity" ON user_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE id = user_id 
      AND LOWER(email) = LOWER(auth.jwt()->>'email')
    )
  );

COMMENT ON TABLE user_activity IS 'Tracks user activity for usage analytics (logins, page views, actions)';
COMMENT ON COLUMN user_activity.activity_type IS 'Type of activity: login, page_view, action';
COMMENT ON COLUMN user_activity.activity_data IS 'Additional JSON data about the activity (e.g., page path, action name)';
