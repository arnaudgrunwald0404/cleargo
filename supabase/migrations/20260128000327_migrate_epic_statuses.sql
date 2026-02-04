-- 20260128000327_migrate_epic_statuses.sql
-- Migrate epic status values from old system to new system
-- Old: PLANNED, PRE_LAUNCH, LAUNCHING, LAUNCHED, POST_LAUNCH, CANCELLED
-- New: Pre_Release, Released_Cohort_1, Released_GA, Released_Retroed, Cancelled

-- Map old statuses to new statuses
UPDATE epic SET status = 'Pre_Release' WHERE status IN ('PLANNED', 'PRE_LAUNCH', 'LAUNCHING');
UPDATE epic SET status = 'Released_Cohort_1' WHERE status = 'LAUNCHED';
UPDATE epic SET status = 'Released_Retroed' WHERE status = 'POST_LAUNCH';
UPDATE epic SET status = 'Cancelled' WHERE status = 'CANCELLED';

-- Add comment documenting the change
COMMENT ON COLUMN epic.status IS 'Epic status: Pre_Release, Released_Cohort_1, Released_GA, Released_Retroed, or Cancelled';
