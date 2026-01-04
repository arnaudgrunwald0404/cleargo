-- 20260103000001_performance_indexes_fix.sql
-- Fix performance issues: Update old indexes and add missing composite indexes for common query patterns

-- ============================================================================
-- Fix old indexes that reference wrong table names (from migration 0010)
-- ============================================================================

-- Drop old indexes that reference renamed tables
DROP INDEX IF EXISTS idx_lcs_last_updated;
DROP INDEX IF EXISTS idx_lcs_condition_owner;
DROP INDEX IF EXISTS idx_lcs_status;
DROP INDEX IF EXISTS idx_lcs_launch_status;
DROP INDEX IF EXISTS idx_lcs_decision_owner; -- Old name from initial migration
DROP INDEX IF EXISTS idx_decision_snapshot_launch;
DROP INDEX IF EXISTS idx_launch_tier_status;
DROP INDEX IF EXISTS idx_launch_target_date_tier;

-- Recreate indexes with correct table names
CREATE INDEX IF NOT EXISTS idx_ecs_last_updated ON epic_criterion_status(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecs_condition_owner ON epic_criterion_status(condition_owner_id);
CREATE INDEX IF NOT EXISTS idx_ecs_status ON epic_criterion_status(status);
CREATE INDEX IF NOT EXISTS idx_ecs_epic_status ON epic_criterion_status(epic_id, status);
CREATE INDEX IF NOT EXISTS idx_decision_snapshot_epic ON decision_snapshot(epic_id);
CREATE INDEX IF NOT EXISTS idx_epic_tier_status ON epic(tier, status);
CREATE INDEX IF NOT EXISTS idx_epic_target_date_tier ON epic(target_launch_date, tier);

-- ============================================================================
-- Add missing indexes for common query patterns
-- ============================================================================

-- Index for condition_due_date (used frequently in filters and nudge jobs)
CREATE INDEX IF NOT EXISTS idx_ecs_condition_due_date ON epic_criterion_status(condition_due_date);

-- Index for decision_owner_id (if not already exists from condition_owner)
CREATE INDEX IF NOT EXISTS idx_ecs_decision_owner ON epic_criterion_status(decision_owner_id);

-- ============================================================================
-- Composite indexes for frequently used query patterns
-- ============================================================================

-- For nudge jobs: filtering by condition_due_date + status + decision_owner_id
-- Used in: /api/jobs/criteria-nudges
CREATE INDEX IF NOT EXISTS idx_ecs_due_date_status_owner 
  ON epic_criterion_status(condition_due_date, status, decision_owner_id)
  WHERE decision_owner_id IS NOT NULL;

-- For nudge jobs: filtering by condition_due_date + status + last_nudge_sent_at
-- Used in: /api/jobs/criteria-nudges (with last_nudge_sent_at conditions)
-- Ensure the column exists first (in case the previous migration hasn't run)
ALTER TABLE epic_criterion_status ADD COLUMN IF NOT EXISTS last_nudge_sent_at date;
-- Then create the index
CREATE INDEX IF NOT EXISTS idx_ecs_due_date_status_nudge 
  ON epic_criterion_status(condition_due_date, status, last_nudge_sent_at)
  WHERE decision_owner_id IS NOT NULL;

-- For risk assessment: filtering by epic_id + condition_due_date + status
-- Used in: /api/dashboard/high-risk-epics, risk-assessment.ts
CREATE INDEX IF NOT EXISTS idx_ecs_epic_due_date_status 
  ON epic_criterion_status(epic_id, condition_due_date, status);

-- For epic detail pages: filtering by epic_id + status (common pattern)
CREATE INDEX IF NOT EXISTS idx_ecs_epic_status_due_date 
  ON epic_criterion_status(epic_id, status, condition_due_date);

-- For queries filtering by status and last_updated_at (my items, activity feed)
CREATE INDEX IF NOT EXISTS idx_ecs_status_last_updated 
  ON epic_criterion_status(status, last_updated_at DESC);

-- ============================================================================
-- Additional indexes for meeting queries
-- ============================================================================

-- For meeting queries filtering by epic_id OR linked_epic_id
-- The individual indexes already exist, but add composite for date filtering
CREATE INDEX IF NOT EXISTS idx_meeting_epic_date 
  ON meeting(epic_id, meeting_date DESC) 
  WHERE epic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_linked_epic_date 
  ON meeting(linked_epic_id, meeting_date DESC) 
  WHERE linked_epic_id IS NOT NULL;

-- ============================================================================
-- Indexes for criterion lookups
-- ============================================================================

-- For criterion filtering by rating_timing (used in due date calculations)
CREATE INDEX IF NOT EXISTS idx_criterion_rating_timing ON criterion(rating_timing);

-- For criterion filtering by decision_owner_email (used in my_items_for_user)
-- These should already exist from optimize_my_items migration, but ensure they exist
CREATE INDEX IF NOT EXISTS idx_criterion_decision_owner_email ON criterion(decision_owner_email);
CREATE INDEX IF NOT EXISTS idx_criterion_decision_owner_email_lower ON criterion(lower(decision_owner_email));

-- ============================================================================
-- Indexes for epic lookups
-- ============================================================================

-- For epic filtering by pod (used in my_items_for_user and PM resolution)
CREATE INDEX IF NOT EXISTS idx_epic_pod ON epic(pod) WHERE pod IS NOT NULL;

-- For epic filtering by aha_id (webhook lookups)
CREATE INDEX IF NOT EXISTS idx_epic_aha_id ON epic(aha_id) WHERE aha_id IS NOT NULL;

-- Composite index for epic filtering by tier + status + target_date (common dashboard queries)
CREATE INDEX IF NOT EXISTS idx_epic_tier_status_date 
  ON epic(tier, status, target_launch_date);

