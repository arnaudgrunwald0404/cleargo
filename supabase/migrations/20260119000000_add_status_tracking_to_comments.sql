-- Add status tracking columns to criterion_comment table
-- This allows us to track which status (yellow/red) was selected when a comment was made
-- and show transition indicators (arrows) when status changes occur
-- Note: Only runs if table exists (may not exist in all deployments)

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'criterion_comment' AND table_schema = 'public') THEN
    ALTER TABLE criterion_comment
      ADD COLUMN IF NOT EXISTS status_at_comment text,
      ADD COLUMN IF NOT EXISTS previous_status text;

    -- Add constraint to ensure status_at_comment is one of the valid statuses
    ALTER TABLE criterion_comment
      DROP CONSTRAINT IF EXISTS criterion_comment_status_at_comment_check;
    ALTER TABLE criterion_comment
      ADD CONSTRAINT criterion_comment_status_at_comment_check
      CHECK (status_at_comment IS NULL OR status_at_comment IN ('GO', 'CONDITIONAL', 'NO_GO', 'NOT_SET'));

    -- Add constraint to ensure previous_status is one of the valid statuses
    ALTER TABLE criterion_comment
      DROP CONSTRAINT IF EXISTS criterion_comment_previous_status_check;
    ALTER TABLE criterion_comment
      ADD CONSTRAINT criterion_comment_previous_status_check
      CHECK (previous_status IS NULL OR previous_status IN ('GO', 'CONDITIONAL', 'NO_GO', 'NOT_SET'));

    -- Add index for querying comments by status
    CREATE INDEX IF NOT EXISTS idx_criterion_comment_status_at_comment 
      ON criterion_comment(status_at_comment) 
      WHERE status_at_comment IS NOT NULL;

    COMMENT ON COLUMN criterion_comment.status_at_comment IS 'The status (GO, CONDITIONAL, NO_GO) when this comment was created. Used to display yellow/red dots.';
    COMMENT ON COLUMN criterion_comment.previous_status IS 'The previous status before the change. Used to display transition arrows (e.g., red->yellow->green).';
  END IF;
END $$;
