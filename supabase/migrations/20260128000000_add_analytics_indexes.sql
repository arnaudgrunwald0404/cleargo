-- 20260128000000_add_analytics_indexes.sql
-- Add database indexes for ClearGO Analytics v1 query performance

-- ============================================================================
-- Indexes for Metric 4: Success Plan Completion
-- ============================================================================

-- Index for epic_success_configs queries filtering by locked and locked_at
CREATE INDEX IF NOT EXISTS idx_epic_success_configs_locked_locked_at 
  ON epic_success_configs(locked, locked_at)
  WHERE locked = true;

-- Index for epic_success_metrics count queries
CREATE INDEX IF NOT EXISTS idx_epic_success_metrics_epic 
  ON epic_success_metrics(epic_id);

-- Composite index for epic queries with scheduled_ga_dev_date and target_launch_date
CREATE INDEX IF NOT EXISTS idx_epic_ga_dates 
  ON epic(scheduled_ga_dev_date, target_launch_date)
  WHERE scheduled_ga_dev_date IS NOT NULL OR target_launch_date IS NOT NULL;

-- ============================================================================
-- Indexes for Metric 5: Retro Completion
-- ============================================================================

-- Index for epic_retros queries filtering by status and submitted_at
CREATE INDEX IF NOT EXISTS idx_epic_retros_status_submitted 
  ON epic_retros(status, submitted_at)
  WHERE status = 'SUBMITTED';

-- Composite index for epic_retros with epic_id for joins
CREATE INDEX IF NOT EXISTS idx_epic_retros_epic_status 
  ON epic_retros(epic_id, status, submitted_at);

-- ============================================================================
-- Indexes for Metric 3: Launch Hygiene Score
-- ============================================================================

-- Index for epic_criterion_status queries with criterion joins (already exists but ensure it's optimized)
-- The existing idx_ecs_epic_status should cover this, but add composite for status filtering
CREATE INDEX IF NOT EXISTS idx_ecs_epic_status_complete 
  ON epic_criterion_status(epic_id, status)
  WHERE status != 'NOT_SET';

-- ============================================================================
-- Indexes for Metric 6: Criteria On-Time Rate
-- ============================================================================

-- Index for epic_criterion_status with last_updated_at (for completion date)
-- Already exists as idx_ecs_last_updated, but ensure it's optimized
-- Add composite for status + last_updated_at filtering
CREATE INDEX IF NOT EXISTS idx_ecs_status_last_updated_complete 
  ON epic_criterion_status(status, last_updated_at DESC)
  WHERE status != 'NOT_SET';

-- Index for criterion label lookups (for grouping by criterion name)
CREATE INDEX IF NOT EXISTS idx_criterion_label 
  ON criterion(label)
  WHERE label IS NOT NULL;

-- ============================================================================
-- Indexes for Metric 7: PM Timeliness Index
-- ============================================================================

-- Index for app_user queries filtering by PM role
CREATE INDEX IF NOT EXISTS idx_app_user_roles_pm 
  ON app_user USING GIN(roles)
  WHERE roles @> ARRAY['PM']::text[];

-- Index for epic_criterion_status with decision_owner_id and PM role criteria
-- Already exists, but ensure composite for PM filtering
CREATE INDEX IF NOT EXISTS idx_ecs_decision_owner_pm 
  ON epic_criterion_status(decision_owner_id, status, last_updated_at)
  WHERE decision_owner_id IS NOT NULL;

-- Index for epic_success_configs with post_launch_owner
CREATE INDEX IF NOT EXISTS idx_epic_success_configs_post_launch_owner 
  ON epic_success_configs(post_launch_owner)
  WHERE post_launch_owner IS NOT NULL;

-- ============================================================================
-- Composite indexes for common analytics query patterns
-- ============================================================================

-- For epic queries with tier, pod, and date range filters
CREATE INDEX IF NOT EXISTS idx_epic_tier_pod_date 
  ON epic(tier, pod, target_launch_date)
  WHERE tier IS NOT NULL AND pod IS NOT NULL;

-- For epic queries with scheduled_ga_dev_date filtering
CREATE INDEX IF NOT EXISTS idx_epic_ga_date_tier 
  ON epic(scheduled_ga_dev_date, tier)
  WHERE scheduled_ga_dev_date IS NOT NULL;

-- For epic_criterion_status with epic_id and criterion_id joins
CREATE INDEX IF NOT EXISTS idx_ecs_epic_criterion 
  ON epic_criterion_status(epic_id, criterion_id);
