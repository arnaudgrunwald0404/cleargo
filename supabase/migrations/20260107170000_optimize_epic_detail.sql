-- 20260107170000_optimize_epic_detail.sql
-- Performance optimizations for epic detail page: add indexes for comments, attachments, and criterion status queries

-- Composite index for epic criterion status queries (epic_id + criterion_id)
-- Speeds up matrix data loading with joins
CREATE INDEX IF NOT EXISTS idx_ecs_epic_criterion 
  ON epic_criterion_status(epic_id, criterion_id);

-- Index for comment lookups by criterion status
-- Speeds up batch comment count queries
CREATE INDEX IF NOT EXISTS idx_criterion_comment_status 
  ON criterion_comment(launch_criterion_status_id);

-- Index for attachment lookups by criterion status
-- Speeds up batch attachment count queries
CREATE INDEX IF NOT EXISTS idx_criterion_attachment_status 
  ON criterion_attachment(launch_criterion_status_id)
  WHERE comment_id IS NULL; -- Only index attachments for criterion status, not comments

-- Composite index for filtering by epic and status
-- Used for filtering matrix items by status
CREATE INDEX IF NOT EXISTS idx_ecs_epic_status 
  ON epic_criterion_status(epic_id, status);

