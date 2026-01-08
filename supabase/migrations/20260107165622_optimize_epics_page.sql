-- 20260107165622_optimize_epics_page.sql
-- Performance optimizations for epics page: add indexes for watch status queries and release lookups

-- Composite index for watch status queries (epic_id + user_id)
-- This significantly speeds up batch watch status lookups
CREATE INDEX IF NOT EXISTS idx_epic_watches_epic_user 
  ON epic_watches(epic_id, user_id);

-- Index for release schedule lookups by release name
-- Speeds up release date lookups when checking which releases have dates
CREATE INDEX IF NOT EXISTS idx_release_schedule_name 
  ON release_schedule(release_name);

-- Index for epic ordering by created_at (descending)
-- Ensures fast sorting when fetching epics
CREATE INDEX IF NOT EXISTS idx_epic_created_at_desc 
  ON epic(created_at DESC);

-- Index for epic filtering by aha_id (if not exists)
-- Used in release-dates API to fetch synchronized epics
CREATE INDEX IF NOT EXISTS idx_epic_aha_id_not_null 
  ON epic(aha_id) 
  WHERE aha_id IS NOT NULL;

