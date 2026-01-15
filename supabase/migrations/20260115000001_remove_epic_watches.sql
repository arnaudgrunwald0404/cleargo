-- Remove epic_watches table and all related indexes
-- Watch functionality has been removed from the application

-- Drop indexes first (before dropping the table)
DROP INDEX IF EXISTS idx_epic_watches_epic_user;
DROP INDEX IF EXISTS idx_epic_watches_epic_id;
DROP INDEX IF EXISTS idx_epic_watches_user_id;
DROP INDEX IF EXISTS idx_epic_watches_user_epic;

-- Drop the table (RLS policies will be automatically dropped)
DROP TABLE IF EXISTS epic_watches;
