-- 20260107170000_optimize_epic_detail.sql
-- Performance optimizations for epic detail page: add indexes for comments, attachments, and criterion status queries

-- Composite index for epic criterion status queries (epic_id + criterion_id)
-- Speeds up matrix data loading with joins
CREATE INDEX IF NOT EXISTS idx_ecs_epic_criterion 
  ON epic_criterion_status(epic_id, criterion_id);

-- Index for comment lookups by criterion status
-- Speeds up batch comment count queries
-- Note: Only create if table exists (may have different name in some deployments)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'criterion_comment' AND table_schema = 'public') THEN
    CREATE INDEX IF NOT EXISTS idx_criterion_comment_status 
      ON criterion_comment(launch_criterion_status_id);
  END IF;
END $$;

-- Index for attachment lookups by criterion status
-- Speeds up batch attachment count queries
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'criterion_attachment' AND table_schema = 'public') THEN
    CREATE INDEX IF NOT EXISTS idx_criterion_attachment_status 
      ON criterion_attachment(launch_criterion_status_id)
      WHERE comment_id IS NULL;
  END IF;
END $$;

-- Composite index for filtering by epic and status
-- Used for filtering matrix items by status
CREATE INDEX IF NOT EXISTS idx_ecs_epic_status 
  ON epic_criterion_status(epic_id, status);

