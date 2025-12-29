-- Migration: Add comments for criterion status
-- Allows users to comment on specific criterion rows

CREATE TABLE IF NOT EXISTS criterion_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_criterion_status_id uuid NOT NULL REFERENCES epic_criterion_status(id) ON DELETE CASCADE,
  comment_text text NOT NULL,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_not_empty CHECK (LENGTH(TRIM(comment_text)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_criterion_comment_lcs ON criterion_comment(launch_criterion_status_id);
CREATE INDEX IF NOT EXISTS idx_criterion_comment_created_by ON criterion_comment(created_by);
CREATE INDEX IF NOT EXISTS idx_criterion_comment_created_at ON criterion_comment(created_at DESC);

-- Enable RLS
ALTER TABLE criterion_comment ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view all comments" ON criterion_comment;
CREATE POLICY "Users can view all comments"
  ON criterion_comment FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create comments" ON criterion_comment;
CREATE POLICY "Authenticated users can create comments"
  ON criterion_comment FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete their own comments" ON criterion_comment;
CREATE POLICY "Users can delete their own comments"
  ON criterion_comment FOR DELETE
  USING (created_by IN (
    SELECT id FROM app_user WHERE email = auth.jwt()->>'email'
  ));

COMMENT ON TABLE criterion_comment IS 'Comments for launch criterion status rows';
COMMENT ON COLUMN criterion_comment.comment_text IS 'Plain text comment - no formatting';







